-- COMPROVA: transições de aprovação atômicas e acesso por empresa.

alter table comprova.approval_instances add column if not exists attempt integer not null default 1;

create table if not exists comprova.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references comprova.approval_instances(id) on delete cascade,
  report_id uuid not null references comprova.reports(id) on delete cascade,
  attempt integer not null,
  step_order integer not null,
  approver_user_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('approve','reject')),
  reason text not null default '',
  decided_at timestamptz not null default now(),
  unique(instance_id,attempt,step_order)
);
create index if not exists comprova_decisions_report_idx on comprova.approval_decisions(report_id,decided_at desc);
create index if not exists comprova_steps_approver_idx on comprova.approval_steps(approver_user_id,flow_id,step_order);

create or replace function comprova.is_company_finance(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from comprova.company_members m
    where m.company_id=p_company_id and m.user_id=(select auth.uid()) and m.active and m.role='finance');
$$;
revoke all on function comprova.is_company_finance(uuid) from public;
grant execute on function comprova.is_company_finance(uuid) to authenticated;

create or replace function comprova.can_review_report(p_report_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from comprova.approval_instances ai
      join comprova.reports r on r.id=ai.report_id and r.status='submitted'
      join comprova.approval_steps s on s.flow_id = ai.flow_id and s.step_order = ai.current_step
      join comprova.company_members m on m.company_id=r.company_id and m.user_id=s.approver_user_id
      where ai.report_id = p_report_id and ai.status = 'pending'
        and m.user_id=(select auth.uid()) and m.active and m.role in ('admin','approver')
  );
$$;
revoke all on function comprova.can_review_report(uuid) from public;
grant execute on function comprova.can_review_report(uuid) to authenticated;

create or replace function comprova.create_approval_flow(p_company_id uuid,p_name text,p_approvers uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_flow uuid; v_approver uuid; v_step integer := 0;
begin
  if not comprova.is_company_admin(p_company_id) then raise exception 'Somente administradores podem configurar aprovações.'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Informe o nome do fluxo.'; end if;
  if coalesce(array_length(p_approvers,1),0) = 0 then raise exception 'Selecione pelo menos um aprovador.'; end if;
  insert into comprova.approval_flows(owner_id,company_id,name)
    values ((select auth.uid()),p_company_id,trim(p_name)) returning id into v_flow;
  foreach v_approver in array p_approvers loop
    if not exists (select 1 from comprova.company_members m where m.company_id=p_company_id
      and m.user_id=v_approver and m.active and m.role in ('admin','approver'))
    then raise exception 'Aprovador fora da equipe ou sem permissão.'; end if;
    v_step := v_step + 1;
    insert into comprova.approval_steps(flow_id,step_order,approver_user_id)
      values (v_flow,v_step,v_approver);
  end loop;
  return v_flow;
end;
$$;
revoke all on function comprova.create_approval_flow(uuid,text,uuid[]) from public;
grant execute on function comprova.create_approval_flow(uuid,text,uuid[]) to authenticated;

create or replace function comprova.validate_assigned_flow()
returns trigger language plpgsql set search_path = '' as $$
declare v_company uuid; v_flow uuid;
begin
  if tg_table_name='companies' then
    v_company:=new.id; v_flow:=new.default_approval_flow_id;
  else
    v_company:=new.company_id; v_flow:=new.approval_flow_id;
  end if;
  if v_flow is not null and not exists (
    select 1 from comprova.approval_flows where id=v_flow and company_id=v_company and active
  ) then raise exception 'Escolha um fluxo ativo da empresa.'; end if;
  return new;
end;
$$;
create trigger comprova_validate_company_flow before update of default_approval_flow_id on comprova.companies
  for each row execute function comprova.validate_assigned_flow();
create trigger comprova_validate_center_flow before insert or update of approval_flow_id,company_id on comprova.cost_centers
  for each row execute function comprova.validate_assigned_flow();

drop policy if exists comprova_reports_select on comprova.reports;
create policy comprova_reports_select on comprova.reports for select to authenticated using (
  (owner_id=(select auth.uid()) and (company_id is null or comprova.is_company_member(company_id))) or comprova.is_company_admin(company_id)
  or (status in ('approved','paid') and comprova.is_company_finance(company_id))
  or comprova.can_review_report(id)
);
drop policy if exists comprova_reports_insert on comprova.reports;
create policy comprova_reports_insert on comprova.reports for insert to authenticated with check (
  owner_id = (select auth.uid()) and comprova.is_company_member(company_id) and status='draft'
);
drop policy if exists comprova_reports_update on comprova.reports;
create policy comprova_reports_update on comprova.reports for update to authenticated
  using (owner_id = (select auth.uid()) and status in ('draft','rejected'))
  with check (owner_id = (select auth.uid()) and status in ('draft','rejected') and comprova.is_company_member(company_id));
drop policy if exists comprova_reports_delete on comprova.reports;
create policy comprova_reports_delete on comprova.reports for delete to authenticated using (
  owner_id=(select auth.uid()) and status='draft' and submitted_at is null
);

create or replace function comprova.validate_report_dimensions()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.cost_center_id is not null and not exists (select 1 from comprova.cost_centers c
    where c.id=new.cost_center_id and c.company_id=new.company_id and c.active)
  then raise exception 'Centro de custo inválido para a empresa.'; end if;
  if new.project_id is not null and not exists (select 1 from comprova.projects p
    where p.id=new.project_id and p.company_id=new.company_id and p.active)
  then raise exception 'Projeto inválido para a empresa.'; end if;
  if new.payment_method_id is not null and not exists (select 1 from comprova.payment_methods p
    where p.id=new.payment_method_id and p.company_id=new.company_id and p.active)
  then raise exception 'Forma de pagamento inválida para a empresa.'; end if;
  if new.approval_flow_id is not null and not exists (select 1 from comprova.approval_flows f
    where f.id=new.approval_flow_id and f.company_id=new.company_id and f.active)
  then raise exception 'Fluxo de aprovação inválido para a empresa.'; end if;
  if tg_op='INSERT' then
    select upper(coalesce(nullif(trim(report_prefix),''),'RMB')) || '-' || upper(left(new.id::text,8))
      into new.report_code from comprova.companies where id=new.company_id;
  end if;
  return new;
end;
$$;
drop trigger if exists comprova_report_dimensions_trigger on comprova.reports;
alter table comprova.reports add column report_code text;
create trigger comprova_report_dimensions_trigger before insert or update of company_id,cost_center_id,project_id,payment_method_id,approval_flow_id
  on comprova.reports for each row execute function comprova.validate_report_dimensions();

drop policy if exists comprova_report_expenses_select on comprova.report_expenses;
create policy comprova_report_expenses_select on comprova.report_expenses for select to authenticated using (
  exists (select 1 from comprova.reports r where r.id=report_expenses.report_id)
);

create or replace function comprova.can_attach_report_expense(p_report_id uuid,p_expense_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from comprova.reports r cross join comprova.expenses e
    where r.id=p_report_id and e.id=p_expense_id and r.owner_id=(select auth.uid())
      and e.user_id=r.owner_id and r.status in ('draft','rejected')
      and comprova.is_company_member(r.company_id)
  );
$$;
revoke all on function comprova.can_attach_report_expense(uuid,uuid) from public;
grant execute on function comprova.can_attach_report_expense(uuid,uuid) to authenticated;
drop policy if exists comprova_report_expenses_insert on comprova.report_expenses;
create policy comprova_report_expenses_insert on comprova.report_expenses for insert to authenticated
  with check (comprova.can_attach_report_expense(report_id,expense_id));
revoke update on comprova.report_expenses from authenticated;

drop policy if exists comprova_expenses_select_own on comprova.expenses;
create policy comprova_expenses_select_own on comprova.expenses for select to authenticated using (
  user_id = (select auth.uid()) or exists (
    select 1 from comprova.report_expenses re join comprova.reports r on r.id=re.report_id
    where re.expense_id=expenses.id
  )
);
drop policy if exists comprova_receipts_select_own on comprova.receipts;
create policy comprova_receipts_select_own on comprova.receipts for select to authenticated using (
  user_id = (select auth.uid()) or exists (
    select 1 from comprova.expenses e join comprova.report_expenses re on re.expense_id=e.id
    join comprova.reports r on r.id=re.report_id
    where e.receipt_id=receipts.id
  )
);
create policy comprova_storage_report_select on storage.objects for select to authenticated using (
  bucket_id='comprova-documents' and exists (
    select 1 from comprova.receipts rec join comprova.expenses e on e.receipt_id=rec.id
    join comprova.report_expenses re on re.expense_id=e.id join comprova.reports r on r.id=re.report_id
    where rec.storage_bucket=storage.objects.bucket_id and rec.storage_path=storage.objects.name
  )
);

drop policy if exists comprova_receipts_insert_own on comprova.receipts;
create policy comprova_receipts_insert_own on comprova.receipts for insert to authenticated with check (
  user_id=(select auth.uid()) and storage_bucket='comprova-documents'
  and split_part(storage_path,'/',1)=(select auth.uid())::text
);
revoke update on comprova.receipts from authenticated;
grant update(status,error_message,updated_at) on comprova.receipts to authenticated;

create or replace function comprova.can_change_storage_object(p_bucket text,p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_bucket in ('comprova-uploads','comprova-documents','comprova-recordings')
    and (split_part(p_name,'/',1)=(select auth.uid())::text or exists (
      select 1 from comprova.user_map m where m.destination_user_id=(select auth.uid())
        and m.source_user_id::text=split_part(p_name,'/',1)
    ))
    and not exists (
      select 1 from comprova.receipts r join comprova.expenses e on e.receipt_id=r.id
      where r.storage_bucket=p_bucket and r.storage_path=p_name
    );
$$;
revoke all on function comprova.can_change_storage_object(text,text) from public;
grant execute on function comprova.can_change_storage_object(text,text) to authenticated;
drop policy if exists comprova_storage_update on storage.objects;
drop policy if exists comprova_storage_delete on storage.objects;
create policy comprova_storage_delete on storage.objects for delete to authenticated using (
  comprova.can_change_storage_object(bucket_id,name)
);

drop policy if exists comprova_approval_flows_owner on comprova.approval_flows;
create policy comprova_approval_flows_select on comprova.approval_flows for select to authenticated
  using (comprova.is_company_member(company_id));
create policy comprova_approval_flows_write on comprova.approval_flows for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));
drop policy if exists comprova_approval_steps_access on comprova.approval_steps;
create policy comprova_approval_steps_select on comprova.approval_steps for select to authenticated using (
  exists (select 1 from comprova.approval_flows f where f.id = flow_id and comprova.is_company_member(f.company_id))
);
create policy comprova_approval_steps_write on comprova.approval_steps for all to authenticated
  using (exists (select 1 from comprova.approval_flows f where f.id = flow_id and comprova.is_company_admin(f.company_id)))
  with check (exists (select 1 from comprova.approval_flows f where f.id = flow_id and comprova.is_company_admin(f.company_id))
    and exists (select 1 from comprova.company_members m join comprova.approval_flows f on f.company_id = m.company_id
      where f.id = flow_id and m.user_id = approver_user_id and m.active and m.role in ('admin','approver')));
drop policy if exists comprova_approval_instances_access on comprova.approval_instances;
create policy comprova_approval_instances_select on comprova.approval_instances for select to authenticated using (
  exists (select 1 from comprova.reports r where r.id = report_id)
);
drop policy if exists comprova_policy_rules_owner on comprova.policy_rules;
create policy comprova_policy_rules_select on comprova.policy_rules for select to authenticated
  using (comprova.is_company_member(company_id));
create policy comprova_policy_rules_write on comprova.policy_rules for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));

alter table comprova.approval_decisions enable row level security;
alter table comprova.approval_decisions add column company_id uuid references comprova.companies(id);
alter table comprova.approval_decisions add column report_name text not null default '';
create policy comprova_decisions_select on comprova.approval_decisions for select to authenticated using (
  (approver_user_id=(select auth.uid()) and comprova.is_company_member(company_id))
  or comprova.is_company_admin(company_id)
  or exists (select 1 from comprova.reports r where r.id=report_id and r.owner_id=(select auth.uid()))
);
grant select on comprova.approval_decisions to authenticated;

-- Remover escrita direta de estados: somente as funções abaixo podem fazer transições.
revoke insert on comprova.reports from authenticated;
grant insert(owner_id,company_id,name,description,currency,period_start,period_end,cost_center_id,project_id,payment_method_id,notes,approval_flow_id)
  on comprova.reports to authenticated;
revoke update on comprova.reports from authenticated;
grant update(name,description,period_start,period_end,cost_center_id,project_id,payment_method_id,notes,approval_flow_id,updated_at)
  on comprova.reports to authenticated;
revoke insert,update,delete on comprova.approval_flows from authenticated;
grant update(name,active,updated_at) on comprova.approval_flows to authenticated;
revoke insert,update,delete on comprova.approval_steps from authenticated;
revoke insert,update,delete on comprova.approval_instances from authenticated;
revoke insert,update,delete on comprova.approval_decisions from authenticated;

create or replace function comprova.submit_report(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_report comprova.reports%rowtype; v_flow comprova.approval_flows%rowtype;
  v_company comprova.companies%rowtype; v_first integer; v_instance uuid; v_count integer;
  v_bad text; v_flow_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Sessão inválida.'; end if;
  select * into v_report from comprova.reports where id = p_report_id for update;
  if not found or v_report.owner_id <> (select auth.uid()) then raise exception 'Relatório não encontrado.'; end if;
  if v_report.status not in ('draft','rejected') then raise exception 'Este relatório não está aberto para envio.'; end if;
  select * into v_company from comprova.companies where id = v_report.company_id;
  if not found or not comprova.is_company_member(v_report.company_id) then raise exception 'Empresa inválida.'; end if;
  if v_company.require_cost_center and v_report.cost_center_id is null then raise exception 'Selecione um centro de custo.'; end if;
  if v_report.cost_center_id is not null then
    select approval_flow_id into v_flow_id from comprova.cost_centers
      where id=v_report.cost_center_id and company_id=v_report.company_id and active;
    if not found then raise exception 'Selecione um centro de custo ativo.'; end if;
  end if;
  select count(*) into v_count from comprova.report_expenses where report_id = p_report_id;
  if v_count = 0 then raise exception 'Adicione pelo menos uma despesa.'; end if;
  select e.id::text into v_bad from comprova.report_expenses re join comprova.expenses e on e.id = re.expense_id
    where re.report_id = p_report_id and (e.amount is null or e.amount <= 0 or e.expense_date is null or
      e.currency <> v_report.currency or (v_company.require_receipt and e.receipt_id is null)
      or (e.receipt_id is not null and not exists (
        select 1 from comprova.receipts rec join storage.objects o on o.bucket_id=rec.storage_bucket and o.name=rec.storage_path
        where rec.id=e.receipt_id and rec.user_id=e.user_id and rec.storage_bucket='comprova-documents'
      ))) limit 1;
  if v_bad is not null then raise exception 'Confira valor, data, moeda e comprovante de todas as despesas.'; end if;
  v_flow_id:=coalesce(v_flow_id,v_company.default_approval_flow_id,v_report.approval_flow_id);
  if v_flow_id is null then raise exception 'Escolha um fluxo de aprovação.'; end if;
  select * into v_flow from comprova.approval_flows where id = v_flow_id
    and company_id = v_report.company_id and active;
  if not found then raise exception 'O fluxo de aprovação não está ativo para esta empresa.'; end if;
  select min(step_order) into v_first from comprova.approval_steps where flow_id = v_flow.id;
  if v_first is null then raise exception 'Configure os aprovadores do fluxo.'; end if;
  if exists (
    select 1 from comprova.approval_steps s where s.flow_id=v_flow.id and not exists (
      select 1 from comprova.company_members m where m.company_id=v_report.company_id
        and m.user_id=s.approver_user_id and m.active and m.role in ('admin','approver')
    )
  ) then raise exception 'O fluxo tem um aprovador sem acesso ativo. Escolha outro fluxo.'; end if;
  if not v_company.allow_self_approval and exists (
    select 1 from comprova.approval_steps where flow_id = v_flow.id and approver_user_id = v_report.owner_id
  ) then raise exception 'O autor não pode aprovar o próprio relatório.'; end if;
  if exists (
    select 1 from comprova.report_expenses re join comprova.expenses e on e.id = re.expense_id
    join comprova.policy_rules p on p.company_id = v_report.company_id and p.active
      and (p.category is null or p.category = e.category)
    where re.report_id = p_report_id and (
      (p.max_amount is not null and e.amount > p.max_amount)
      or (p.requires_receipt and e.receipt_id is null)
      or (p.max_days_after_expense is not null and current_date-e.expense_date > p.max_days_after_expense)
    )
  ) then raise exception 'Há despesas fora do limite, prazo ou exigência de comprovante da política da empresa.'; end if;
  if exists (
    select 1 from comprova.report_expenses re join comprova.expenses e on e.id=re.expense_id
    where re.report_id=p_report_id and e.vexpenses_status='sending'
  ) then raise exception 'Há uma despesa em envio externo. Aguarde a conclusão antes de enviar o relatório.'; end if;
  update comprova.reports set status = 'submitted',submitted_at = now(),rejection_reason = null,updated_at = now(),approval_flow_id=v_flow.id,
    total_amount=(select sum(e.amount) from comprova.report_expenses re join comprova.expenses e on e.id=re.expense_id where re.report_id=p_report_id)
    where id = p_report_id;
  insert into comprova.approval_instances(report_id,flow_id,current_step,status,decided_by,decided_at,rejection_reason,updated_at)
    values (p_report_id,v_flow.id,v_first,'pending',null,null,null,now())
    on conflict (report_id) do update set flow_id = excluded.flow_id,current_step = excluded.current_step,
      attempt = comprova.approval_instances.attempt + 1,
      status = 'pending',decided_by = null,decided_at = null,rejection_reason = null,updated_at = now()
    returning id into v_instance;
  insert into comprova.audit_events(actor_user_id,entity_type,entity_id,action,metadata)
    values ((select auth.uid()),'report',p_report_id,'submitted',jsonb_build_object('flow_id',v_flow.id));
  return jsonb_build_object('report_id',p_report_id,'approval_id',v_instance,'status','submitted');
end;
$$;
revoke all on function comprova.submit_report(uuid) from public;
grant execute on function comprova.submit_report(uuid) to authenticated;

create or replace function comprova.decide_report(p_instance_id uuid,p_decision text,p_reason text,p_attempt integer,p_step integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_instance comprova.approval_instances%rowtype; v_report comprova.reports%rowtype;
  v_next integer; v_reason text := trim(coalesce(p_reason,'')); v_self_allowed boolean;
begin
  if (select auth.uid()) is null then raise exception 'Sessão inválida.'; end if;
  if p_decision is null or p_decision not in ('approve','reject') then raise exception 'Decisão inválida.'; end if;
  select r.* into v_report from comprova.reports r join comprova.approval_instances ai on ai.report_id=r.id
    where ai.id=p_instance_id for update of r;
  if not found or v_report.status <> 'submitted' then raise exception 'O relatório não está em aprovação.'; end if;
  select * into v_instance from comprova.approval_instances where id = p_instance_id for update;
  if v_instance.status <> 'pending' or v_instance.attempt is distinct from p_attempt
    or v_instance.current_step is distinct from p_step then raise exception 'A aprovação mudou. Atualize a tela antes de decidir.'; end if;
  if not comprova.can_review_report(v_report.id) then raise exception 'Você não é o aprovador ativo desta etapa.'; end if;
  if not exists (select 1 from comprova.approval_steps s where s.flow_id = v_instance.flow_id
    and s.step_order = v_instance.current_step and s.approver_user_id = (select auth.uid()))
  then raise exception 'Você não é o aprovador desta etapa.'; end if;
  select allow_self_approval into v_self_allowed from comprova.companies where id = v_report.company_id;
  if v_report.owner_id = (select auth.uid()) and not coalesce(v_self_allowed,false)
  then raise exception 'Você não pode aprovar seu próprio relatório.'; end if;
  if p_decision = 'reject' and length(v_reason) < 3 then raise exception 'Informe o motivo da rejeição.'; end if;
  insert into comprova.approval_decisions(instance_id,report_id,company_id,report_name,attempt,step_order,approver_user_id,decision,reason)
    values (p_instance_id,v_report.id,v_report.company_id,v_report.name,v_instance.attempt,v_instance.current_step,(select auth.uid()),p_decision,v_reason);
  if p_decision = 'reject' then
    update comprova.approval_instances set status='rejected',decided_by=(select auth.uid()),decided_at=now(),
      rejection_reason=v_reason,updated_at=now() where id=p_instance_id;
    update comprova.reports set status='rejected',rejection_reason=v_reason,updated_at=now() where id=v_report.id;
    insert into comprova.audit_events(actor_user_id,entity_type,entity_id,action,metadata)
      values ((select auth.uid()),'report',v_report.id,'rejected',jsonb_build_object('reason',v_reason));
    return jsonb_build_object('report_id',v_report.id,'status','rejected');
  end if;
  select min(step_order) into v_next from comprova.approval_steps
    where flow_id=v_instance.flow_id and step_order > v_instance.current_step;
  if v_next is not null then
    update comprova.approval_instances set current_step=v_next,updated_at=now() where id=p_instance_id;
    insert into comprova.audit_events(actor_user_id,entity_type,entity_id,action,metadata)
      values ((select auth.uid()),'report',v_report.id,'step_approved',jsonb_build_object('next_step',v_next));
    return jsonb_build_object('report_id',v_report.id,'status','submitted','next_step',v_next);
  end if;
  update comprova.approval_instances set status='approved',decided_by=(select auth.uid()),decided_at=now(),updated_at=now()
    where id=p_instance_id;
  update comprova.reports set status='approved',approved_at=now(),updated_at=now() where id=v_report.id;
  insert into comprova.audit_events(actor_user_id,entity_type,entity_id,action,metadata)
    values ((select auth.uid()),'report',v_report.id,'approved','{}'::jsonb);
  return jsonb_build_object('report_id',v_report.id,'status','approved');
end;
$$;
revoke all on function comprova.decide_report(uuid,text,text,integer,integer) from public;
grant execute on function comprova.decide_report(uuid,text,text,integer,integer) to authenticated;

create or replace function comprova.mark_report_paid(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_report comprova.reports%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Sessão inválida.'; end if;
  select * into v_report from comprova.reports where id = p_report_id for update;
  if not found or v_report.status <> 'approved' then raise exception 'Relatório não aprovado.'; end if;
  if not exists (select 1 from comprova.company_members m where m.company_id=v_report.company_id
    and m.user_id=(select auth.uid()) and m.active and m.role in ('admin','finance'))
  then raise exception 'Somente administração ou financeiro podem confirmar pagamento.'; end if;
  update comprova.reports set status='paid',paid_at=now(),updated_at=now() where id=p_report_id;
  insert into comprova.audit_events(actor_user_id,entity_type,entity_id,action,metadata)
    values ((select auth.uid()),'report',p_report_id,'paid','{}'::jsonb);
  return jsonb_build_object('report_id',p_report_id,'status','paid');
end;
$$;
revoke all on function comprova.mark_report_paid(uuid) from public;
grant execute on function comprova.mark_report_paid(uuid) to authenticated;

create or replace function comprova.withdraw_report(p_report_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_report comprova.reports%rowtype;
begin
  select * into v_report from comprova.reports where id=p_report_id for update;
  if not found or not comprova.is_company_member(v_report.company_id)
    or (v_report.owner_id is distinct from (select auth.uid()) and not comprova.is_company_admin(v_report.company_id))
  then raise exception 'Você não pode retirar este relatório.'; end if;
  if v_report.status<>'submitted' then raise exception 'Só é possível retirar um relatório que está em aprovação.'; end if;
  update comprova.approval_instances set status='cancelled',updated_at=now() where report_id=p_report_id and status='pending';
  if not found then raise exception 'A aprovação não está pendente.'; end if;
  update comprova.reports set status='draft',updated_at=now() where id=p_report_id;
  insert into comprova.audit_events(actor_user_id,entity_type,entity_id,action,metadata)
    values ((select auth.uid()),'report',p_report_id,'withdrawn','{}'::jsonb);
end;
$$;
revoke all on function comprova.withdraw_report(uuid) from public;
grant execute on function comprova.withdraw_report(uuid) to authenticated;

alter table comprova.expenses alter column receipt_id drop not null;
alter table comprova.expenses add column entry_source text not null default 'ocr'
  check (entry_source in ('ocr','manual'));

create or replace function comprova.add_manual_report_expense(
  p_report_id uuid,p_supplier text,p_date date,p_amount numeric,p_category text,p_description text,p_receipt_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_report comprova.reports%rowtype; v_expense uuid; v_category text:=trim(coalesce(p_category,''));
begin
  select * into v_report from comprova.reports where id=p_report_id for update;
  if not found or v_report.owner_id is distinct from (select auth.uid())
    or not comprova.is_company_member(v_report.company_id) or v_report.status not in ('draft','rejected')
  then raise exception 'O relatório não está disponível para incluir despesas.'; end if;
  if p_amount is null or p_amount<=0 or p_amount>999999999.99 or p_date is null or p_date>current_date
    or length(trim(coalesce(p_supplier,''))) not between 1 and 160 or length(v_category) not between 1 and 80
  then raise exception 'Confira fornecedor, categoria, data e valor da despesa.'; end if;
  if exists (select 1 from comprova.expense_categories where company_id=v_report.company_id and active)
    and not exists (select 1 from comprova.expense_categories where company_id=v_report.company_id and active and name=v_category)
  then raise exception 'Escolha uma categoria cadastrada pela empresa.'; end if;
  if p_receipt_id is not null and not exists (
    select 1 from comprova.receipts where id=p_receipt_id and user_id=(select auth.uid()) and storage_bucket='comprova-documents'
  ) then raise exception 'Comprovante não encontrado.'; end if;
  if p_receipt_id is null and exists (select 1 from comprova.companies where id=v_report.company_id and require_receipt)
    then raise exception 'A empresa exige comprovante para esta despesa.'; end if;
  insert into comprova.expenses(receipt_id,user_id,supplier,expense_date,amount,currency,category,description,confidence,entry_source)
    values(p_receipt_id,(select auth.uid()),trim(p_supplier),p_date,round(p_amount,2),v_report.currency,v_category,left(coalesce(p_description,''),1000),'alta','manual')
    returning id into v_expense;
  insert into comprova.report_expenses(report_id,expense_id,position)
    values(p_report_id,v_expense,coalesce((select max(position)+1 from comprova.report_expenses where report_id=p_report_id),0));
  return v_expense;
end;
$$;
revoke all on function comprova.add_manual_report_expense(uuid,text,date,numeric,text,text,uuid) from public;
grant execute on function comprova.add_manual_report_expense(uuid,text,date,numeric,text,text,uuid) to authenticated;

-- Despesas em relatórios enviados/aprovados não podem ser alteradas pelo proprietário.
create or replace function comprova.owns_receipt(p_receipt_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from comprova.receipts where id=p_receipt_id and user_id=(select auth.uid()));
$$;
revoke all on function comprova.owns_receipt(uuid) from public;
grant execute on function comprova.owns_receipt(uuid) to authenticated;
drop policy if exists comprova_expenses_insert_own on comprova.expenses;
create policy comprova_expenses_insert_own on comprova.expenses for insert to authenticated
  with check (user_id=(select auth.uid()) and comprova.owns_receipt(receipt_id));
drop policy if exists comprova_expenses_update_own on comprova.expenses;
create policy comprova_expenses_update_own on comprova.expenses for update to authenticated
  using (user_id = (select auth.uid()) and not exists (
    select 1 from comprova.report_expenses re join comprova.reports r on r.id = re.report_id
    where re.expense_id = expenses.id and r.status not in ('draft','rejected')
  ))
  with check (user_id=(select auth.uid()) and (receipt_id is null or comprova.owns_receipt(receipt_id)));
drop policy if exists comprova_expenses_delete_own on comprova.expenses;
create policy comprova_expenses_delete_own on comprova.expenses for delete to authenticated
  using (user_id = (select auth.uid()) and not exists (
    select 1 from comprova.report_expenses re join comprova.reports r on r.id = re.report_id
    where re.expense_id = expenses.id and r.status not in ('draft','rejected')
  ));

create or replace function comprova.lock_report_link()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_report uuid; v_status text; v_owner uuid;
begin
  if tg_op='INSERT' then
    v_report:=new.report_id;
    perform 1 from comprova.expenses where id=new.expense_id and user_id=(select auth.uid()) for update;
    if not found then raise exception 'Despesa não autorizada.'; end if;
  else
    v_report:=old.report_id;
  end if;
  select status,owner_id into v_status,v_owner from comprova.reports where id=v_report for update;
  if not found and tg_op='DELETE' then return old; end if;
  if v_owner is distinct from (select auth.uid()) or v_status not in ('draft','rejected')
    then raise exception 'Relatório bloqueado para edição.'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function comprova.lock_report_link() from public;
create trigger comprova_lock_report_link_trigger before insert or delete on comprova.report_expenses
  for each row execute function comprova.lock_report_link();

create or replace function comprova.lock_expense_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select r.status into v_status from comprova.report_expenses re join comprova.reports r on r.id=re.report_id
    where re.expense_id=old.id for update of r;
  if found and v_status not in ('draft','rejected') then raise exception 'Relatório bloqueado para edição.'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function comprova.lock_expense_report() from public;
create trigger comprova_lock_expense_report_trigger before update or delete on comprova.expenses
  for each row execute function comprova.lock_expense_report();

create or replace function comprova.recalculate_report_total()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_report uuid;
begin
  if tg_op = 'DELETE' then v_report := old.report_id; else v_report := new.report_id; end if;
  if tg_op='DELETE' and not exists (select 1 from comprova.reports where id=v_report) then return null; end if;
  if (select auth.uid()) is null or not exists (
    select 1 from comprova.reports r where r.id=v_report and r.owner_id=(select auth.uid()) and r.status in ('draft','rejected')
  ) then raise exception 'Relatório bloqueado para edição.'; end if;
  update comprova.reports r set total_amount=coalesce((
    select sum(coalesce(e.amount,0)) from comprova.report_expenses re
    join comprova.expenses e on e.id=re.expense_id where re.report_id=v_report
  ),0),updated_at=now() where r.id=v_report;
  return null;
end;
$$;

create or replace function comprova.refresh_report_total_on_expense_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or new.user_id <> (select auth.uid()) then raise exception 'Despesa não autorizada.'; end if;
  update comprova.reports r set total_amount = coalesce((
    select sum(coalesce(e.amount,0)) from comprova.report_expenses re
    join comprova.expenses e on e.id=re.expense_id where re.report_id=r.id
  ),0),updated_at=now()
  where r.owner_id=(select auth.uid()) and r.status in ('draft','rejected')
    and exists (select 1 from comprova.report_expenses re where re.report_id=r.id and re.expense_id=new.id);
  return new;
end;
$$;
drop trigger if exists comprova_expense_total_trigger on comprova.expenses;
create trigger comprova_expense_total_trigger after update of amount on comprova.expenses
  for each row execute function comprova.refresh_report_total_on_expense_change();
