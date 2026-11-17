-- Project membership and approval responsibility live only in comprova.
-- Historical projects, cost centers, flows, decisions and approval instances are retained.
alter table comprova.projects
  add column description text not null default '' check (char_length(description) <= 1000),
  add constraint comprova_projects_company_id_id_key unique (company_id,id);

create table comprova.project_members (
  company_id uuid not null,
  project_id uuid not null,
  member_id uuid not null,
  primary key (company_id,project_id,member_id),
  foreign key (company_id,project_id) references comprova.projects(company_id,id) on delete cascade,
  foreign key (company_id,member_id) references comprova.company_members(company_id,id) on delete cascade
);
create index comprova_project_members_member_idx on comprova.project_members(company_id,member_id,project_id);

create table comprova.member_approvers (
  company_id uuid not null,
  requester_member_id uuid not null,
  approver_member_id uuid not null,
  position integer not null check (position > 0),
  primary key (company_id,requester_member_id,approver_member_id),
  unique (company_id,requester_member_id,position),
  foreign key (company_id,requester_member_id) references comprova.company_members(company_id,id) on delete cascade,
  foreign key (company_id,approver_member_id) references comprova.company_members(company_id,id) on delete cascade,
  check (requester_member_id <> approver_member_id)
);
create index comprova_member_approvers_approver_idx on comprova.member_approvers(company_id,approver_member_id,requester_member_id);

alter table comprova.project_members enable row level security;
alter table comprova.member_approvers enable row level security;
revoke all on comprova.project_members,comprova.member_approvers from public,anon,authenticated;
grant select on comprova.project_members,comprova.member_approvers to authenticated;

create policy comprova_project_members_read on comprova.project_members for select to authenticated using (
  comprova.is_company_admin(company_id) or exists (
    select 1 from comprova.company_members m
    where m.company_id=project_members.company_id and m.id=project_members.member_id and m.active and m.user_id=(select auth.uid())
  )
);
create policy comprova_member_approvers_read on comprova.member_approvers for select to authenticated using (
  comprova.is_company_admin(company_id) or exists (
    select 1 from comprova.company_members m
    where m.company_id=member_approvers.company_id and m.id in (member_approvers.requester_member_id,member_approvers.approver_member_id)
      and m.active and m.user_id=(select auth.uid())
  )
);

-- Promote archival over destructive catalog deletion. All project edits are atomic with memberships.
revoke insert,update,delete on comprova.projects from authenticated;

create function comprova.save_managed_project(
  p_company_id uuid, p_project_id uuid, p_name text, p_code text, p_description text, p_active boolean, p_member_ids uuid[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name,''));
  v_code text := btrim(coalesce(p_code,''));
  v_description text := btrim(coalesce(p_description,''));
  v_members uuid[] := coalesce(p_member_ids,'{}'::uuid[]);
begin
  if (select auth.uid()) is null or not comprova.is_company_admin(p_company_id) then
    raise exception 'Somente administradores podem gerenciar projetos.' using errcode='42501';
  end if;
  if char_length(v_name) not between 1 and 160 or char_length(v_code)>60 or char_length(v_description)>1000
     or p_active is null or cardinality(v_members)>1000 then
    raise exception 'Confira os dados do projeto.' using errcode='22023';
  end if;
  perform 1 from comprova.companies where id=p_company_id for update;
  if exists (
    select 1 from unnest(v_members) as uid(id)
    where not exists (select 1 from comprova.company_members m where m.company_id=p_company_id and m.id=uid.id
      and (m.active or exists (select 1 from comprova.project_members pm where pm.company_id=p_company_id
        and pm.project_id=p_project_id and pm.member_id=m.id)))
  ) then raise exception 'Selecione somente membros desta empresa.' using errcode='22023'; end if;
  if exists (
    select 1 from comprova.projects where company_id=p_company_id and lower(btrim(name))=lower(v_name)
    and id is distinct from p_project_id
  ) then raise exception 'Já existe um projeto com este nome.' using errcode='23505'; end if;
  if p_project_id is null then
    insert into comprova.projects(company_id,name,code,description,active)
      values(p_company_id,v_name,v_code,v_description,p_active) returning id into v_id;
  else
    update comprova.projects set name=v_name,code=v_code,description=v_description,active=p_active
     where company_id=p_company_id and id=p_project_id returning id into v_id;
    if v_id is null then raise exception 'Projeto não encontrado.' using errcode='22023'; end if;
  end if;
  delete from comprova.project_members where company_id=p_company_id and project_id=v_id and not (member_id=any(v_members));
  insert into comprova.project_members(company_id,project_id,member_id)
     select distinct p_company_id,v_id,id from unnest(v_members) as uid(id) on conflict do nothing;
  return v_id;
end;
$$;
revoke all on function comprova.save_managed_project(uuid,uuid,text,text,text,boolean,uuid[]) from public,anon,authenticated;
grant execute on function comprova.save_managed_project(uuid,uuid,text,text,text,boolean,uuid[]) to authenticated;

create function comprova.set_member_projects(p_company_id uuid,p_member_id uuid,p_project_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_projects uuid[] := coalesce(p_project_ids,'{}'::uuid[]);
begin
  if (select auth.uid()) is null or not comprova.is_company_admin(p_company_id) then
    raise exception 'Somente administradores podem alterar vínculos de projetos.' using errcode='42501';
  end if;
  perform 1 from comprova.companies where id=p_company_id for update;
  if not exists (select 1 from comprova.company_members where company_id=p_company_id and id=p_member_id)
    or cardinality(v_projects)>1000 or exists (
    select 1 from unnest(v_projects) as uid(id)
    where not exists (select 1 from comprova.projects p where p.company_id=p_company_id and p.id=uid.id
      and (p.active or exists (select 1 from comprova.project_members pm where pm.company_id=p_company_id
        and pm.project_id=p.id and pm.member_id=p_member_id)))
  ) then raise exception 'Confira o membro e os projetos selecionados.' using errcode='22023'; end if;
  delete from comprova.project_members where company_id=p_company_id and member_id=p_member_id and not (project_id=any(v_projects));
  insert into comprova.project_members(company_id,member_id,project_id)
    select distinct p_company_id,p_member_id,id from unnest(v_projects) as uid(id) on conflict do nothing;
end;
$$;
revoke all on function comprova.set_member_projects(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function comprova.set_member_projects(uuid,uuid,uuid[]) to authenticated;

create function comprova.set_member_approvers(
  p_company_id uuid,p_member_id uuid,p_approver_ids uuid[],p_requester_ids uuid[] default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_member comprova.company_members%rowtype;
  v_ids uuid[] := coalesce(p_approver_ids,'{}'::uuid[]);
begin
  if (select auth.uid()) is null or not comprova.is_company_admin(p_company_id) then
    raise exception 'Somente administradores podem atribuir aprovadores.' using errcode='42501';
  end if;
  perform 1 from comprova.companies where id=p_company_id for update;
  select * into v_member from comprova.company_members where company_id=p_company_id and id=p_member_id;
  if not found or cardinality(v_ids)>500 or cardinality(p_requester_ids)>500
    or exists (select 1 from unnest(v_ids) as uid(id) where uid.id is null or uid.id=p_member_id)
    or cardinality(v_ids)<>(select count(distinct id) from unnest(v_ids) as uid(id)) then
    raise exception 'Confira os vínculos de aprovação.' using errcode='22023';
  end if;
  if exists (
    select 1 from unnest(v_ids) as uid(id) where not exists (
      select 1 from comprova.company_members m where m.company_id=p_company_id and m.id=uid.id and m.active and m.role in ('admin','approver')
    )
  ) then raise exception 'Selecione somente aprovadores ativos da empresa.' using errcode='22023'; end if;
  if p_requester_ids is not null then
    if cardinality(p_requester_ids)>0 and (not v_member.active or v_member.role not in ('admin','approver')) then
      raise exception 'Somente Administradores e Intermediários ativos podem aprovar.' using errcode='22023';
    end if;
    if exists (
      select 1 from unnest(p_requester_ids) as uid(id) where uid.id is null or uid.id=p_member_id or not exists (
        select 1 from comprova.company_members m where m.company_id=p_company_id and m.id=uid.id and m.active
      )
    ) then raise exception 'Selecione somente solicitantes ativos da empresa.' using errcode='22023'; end if;
  end if;

  delete from comprova.member_approvers where company_id=p_company_id and requester_member_id=p_member_id;
  insert into comprova.member_approvers(company_id,requester_member_id,approver_member_id,position)
    select p_company_id,p_member_id,id,ord::integer from unnest(v_ids) with ordinality as uid(id,ord);
  if p_requester_ids is not null then
    delete from comprova.member_approvers where company_id=p_company_id and approver_member_id=p_member_id
      and not (requester_member_id=any(p_requester_ids));
    insert into comprova.member_approvers(company_id,requester_member_id,approver_member_id,position)
    select p_company_id,uid.id,p_member_id,coalesce((
      select max(ma.position) from comprova.member_approvers ma where ma.company_id=p_company_id and ma.requester_member_id=uid.id
    ),0)+1 from (select distinct unnest(p_requester_ids) as id) uid
    where not exists (select 1 from comprova.member_approvers ma where ma.company_id=p_company_id
      and ma.requester_member_id=uid.id and ma.approver_member_id=p_member_id);
  end if;
end;
$$;
revoke all on function comprova.set_member_approvers(uuid,uuid,uuid[],uuid[]) from public,anon,authenticated;
grant execute on function comprova.set_member_approvers(uuid,uuid,uuid[],uuid[]) to authenticated;

-- Keep synthetic flows immutable while using the existing approval instances, steps and RLS.
alter table comprova.approval_flows add column member_snapshot boolean not null default false;
drop policy comprova_approval_flows_select on comprova.approval_flows;
create policy comprova_approval_flows_select on comprova.approval_flows for select to authenticated
  using (comprova.is_company_member(company_id) and
    (not member_snapshot or owner_id=(select auth.uid()) or comprova.is_company_admin(company_id)));
drop policy comprova_approval_flows_write on comprova.approval_flows;
create policy comprova_approval_flows_write on comprova.approval_flows for all to authenticated
  using (not member_snapshot and company_id is not null and comprova.is_company_admin(company_id))
  with check (not member_snapshot and company_id is not null and comprova.is_company_admin(company_id));
drop policy comprova_approval_steps_select on comprova.approval_steps;
create policy comprova_approval_steps_select on comprova.approval_steps for select to authenticated using (
  exists (select 1 from comprova.approval_flows f where f.id=flow_id and comprova.is_company_member(f.company_id))
  or (approver_user_id=(select auth.uid()) and exists (
    select 1 from comprova.approval_instances ai where ai.flow_id=approval_steps.flow_id
      and ai.status='pending' and ai.current_step=approval_steps.step_order
  ))
);
drop policy comprova_approval_steps_write on comprova.approval_steps;
create policy comprova_approval_steps_write on comprova.approval_steps for all to authenticated
  using (exists (select 1 from comprova.approval_flows f where f.id=flow_id and not f.member_snapshot and comprova.is_company_admin(f.company_id)))
  with check (exists (select 1 from comprova.approval_flows f where f.id=flow_id and not f.member_snapshot and comprova.is_company_admin(f.company_id)));

-- Report API and direct PostgREST inserts are subject to the same new dimensions.
-- Existing draft metadata can still be read, withdrawn and corrected without rewriting history.
create function comprova.validate_managed_report_dimensions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.company_id is not distinct from new.company_id
    and old.owner_id is not distinct from new.owner_id and old.currency is not distinct from new.currency
    and old.project_id is not distinct from new.project_id and old.payment_method_id is not distinct from new.payment_method_id
  then return new; end if;
  if new.currency is distinct from 'BRL' then raise exception 'Use reais (BRL) nos novos relatórios.' using errcode='22023'; end if;
  if new.project_id is null or not exists (
    select 1 from comprova.projects p join comprova.project_members pm on pm.company_id=p.company_id and pm.project_id=p.id
    join comprova.company_members m on m.company_id=pm.company_id and m.id=pm.member_id
    where p.company_id=new.company_id and p.id=new.project_id and p.active and m.active and m.user_id=new.owner_id
  ) then raise exception 'Selecione um projeto ativo vinculado ao autor.' using errcode='22023'; end if;
  if new.payment_method_id is null or not exists (
    select 1 from comprova.payment_methods pm where pm.company_id=new.company_id and pm.id=new.payment_method_id and pm.active
  ) then raise exception 'Selecione uma forma de pagamento ativa.' using errcode='22023'; end if;
  return new;
end;
$$;
revoke all on function comprova.validate_managed_report_dimensions() from public,anon,authenticated;
create trigger comprova_managed_report_dimensions before insert or update of company_id,owner_id,currency,project_id,payment_method_id
  on comprova.reports for each row execute function comprova.validate_managed_report_dimensions();

create or replace function comprova.submit_report(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_report comprova.reports%rowtype;
  v_company comprova.companies%rowtype;
  v_member_id uuid;
  v_flow_id uuid;
  v_instance uuid;
  v_ids uuid[];
begin
  if v_actor is null then raise exception 'Sessão inválida.'; end if;
  select * into v_report from comprova.reports where id=p_report_id for update;
  if not found or v_report.owner_id <> v_actor then raise exception 'Relatório não encontrado.'; end if;
  if v_report.status not in ('draft','rejected') then raise exception 'Este relatório não está aberto para envio.'; end if;
  select * into v_company from comprova.companies where id=v_report.company_id for share;
  if not found then raise exception 'Empresa inválida.'; end if;
  select id into v_member_id from comprova.company_members where company_id=v_company.id and user_id=v_actor and active;
  if not found then raise exception 'Membro ativo da empresa não encontrado.'; end if;
  if v_report.currency is distinct from 'BRL' then raise exception 'Use reais (BRL) no relatório.'; end if;
  if not exists (
    select 1 from comprova.projects p join comprova.project_members pm on pm.company_id=p.company_id and pm.project_id=p.id
    where p.company_id=v_company.id and p.id=v_report.project_id and p.active and pm.member_id=v_member_id
  ) then raise exception 'Selecione um projeto ativo vinculado ao autor.'; end if;
  if not exists (
    select 1 from comprova.payment_methods pm where pm.company_id=v_company.id and pm.id=v_report.payment_method_id and pm.active
  ) then raise exception 'Selecione uma forma de pagamento ativa.'; end if;
  if not exists (select 1 from comprova.report_expenses where report_id=p_report_id)
    then raise exception 'Adicione pelo menos uma despesa.'; end if;
  if exists (
    select 1 from comprova.report_expenses re join comprova.expenses e on e.id=re.expense_id
    where re.report_id=p_report_id and (e.amount is null or e.amount<=0 or e.amount='NaN'::numeric
      or nullif(btrim(e.description),'') is null or e.expense_date is null or e.currency is distinct from 'BRL'
      or (v_company.require_receipt and e.receipt_id is null) or (e.receipt_id is not null and not exists (
        select 1 from comprova.receipts rec join storage.objects o on o.bucket_id=rec.storage_bucket and o.name=rec.storage_path
        where rec.id=e.receipt_id and rec.user_id=e.user_id and rec.storage_bucket='comprova-documents'
      )))
  ) then raise exception 'Confira valor positivo, descrição, data, moeda e comprovante de todas as despesas.'; end if;
  if exists (
    select 1 from comprova.report_expenses re join comprova.expenses e on e.id=re.expense_id
    join comprova.policy_rules p on p.company_id=v_company.id and p.active and (p.category is null or p.category=e.category)
    where re.report_id=p_report_id and (
      (p.max_amount is not null and e.amount>p.max_amount) or (p.requires_receipt and e.receipt_id is null)
      or (p.max_days_after_expense is not null and current_date-e.expense_date>p.max_days_after_expense)
    )
  ) then raise exception 'Há despesas fora do limite, prazo ou exigência de comprovante da política da empresa.'; end if;
  if exists (
    select 1 from comprova.report_expenses re join comprova.expenses e on e.id=re.expense_id
    where re.report_id=p_report_id and e.vexpenses_status='sending'
  ) then raise exception 'Há uma despesa em envio externo. Aguarde a conclusão antes de enviar o relatório.'; end if;

  select array_agg(case when m.active and m.role in ('admin','approver') and m.user_id<>v_actor
    then m.user_id end order by ma.position) into v_ids
  from comprova.member_approvers ma join comprova.company_members m on m.company_id=ma.company_id and m.id=ma.approver_member_id
  where ma.company_id=v_company.id and ma.requester_member_id=v_member_id;
  if coalesce(cardinality(v_ids),0)=0 then
    raise exception 'Peça ao administrador para vincular quem aprova seus relatórios em Membros de equipe.';
  end if;
  if array_position(v_ids,null::uuid) is not null then
    raise exception 'Há um aprovador sem acesso ativo. Peça ao administrador para revisar os vínculos.';
  end if;
  insert into comprova.approval_flows(owner_id,company_id,name,active,member_snapshot)
    values (v_actor,v_company.id,'Aprovação por membros',true,true) returning id into v_flow_id;
  insert into comprova.approval_steps(flow_id,step_order,approver_user_id)
    select v_flow_id,ord::integer,id from unnest(v_ids) with ordinality as uid(id,ord);
  update comprova.reports set status='submitted',submitted_at=now(),rejection_reason=null,updated_at=now(),approval_flow_id=v_flow_id,
    total_amount=(select sum(e.amount) from comprova.report_expenses re join comprova.expenses e on e.id=re.expense_id where re.report_id=p_report_id)
    where id=p_report_id;
  insert into comprova.approval_instances(report_id,flow_id,current_step,status,decided_by,decided_at,rejection_reason,updated_at)
    values(p_report_id,v_flow_id,1,'pending',null,null,null,now())
    on conflict(report_id) do update set flow_id=excluded.flow_id,current_step=excluded.current_step,
      attempt=comprova.approval_instances.attempt+1,status='pending',decided_by=null,decided_at=null,rejection_reason=null,updated_at=now()
    returning id into v_instance;
  insert into comprova.audit_events(actor_user_id,entity_type,entity_id,action,metadata)
    values(v_actor,'report',p_report_id,'submitted',jsonb_build_object('flow_id',v_flow_id,'routing','member_approvers'));
  return jsonb_build_object('report_id',p_report_id,'approval_id',v_instance,'status','submitted');
end;
$$;
revoke all on function comprova.submit_report(uuid) from public,anon;
grant execute on function comprova.submit_report(uuid) to authenticated;
