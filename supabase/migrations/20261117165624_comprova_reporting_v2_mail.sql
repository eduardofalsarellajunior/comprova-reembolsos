-- V2 reporting and transactional approval mail. Apply after the three 202611171648xx
-- migrations. No historical money/currencies, Auth identities or shared objects change.
-- OCR expenses remain recoverable extraction drafts until linked to a report.

create function comprova.reporting_expense_fields_valid(p_amount numeric,p_currency text,p_description text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_amount>0 and p_amount<=999999999.99 and p_amount<>'NaN'::numeric
    and p_amount=round(p_amount,2) and p_currency='BRL'
    and char_length(btrim(p_description)) between 1 and 1000,false);
$$;
revoke all on function comprova.reporting_expense_fields_valid(numeric,text,text) from public,anon,authenticated;

create function comprova.assert_reporting_dimensions(
  p_company uuid,p_owner uuid,p_project uuid,p_payment uuid,p_currency text
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_currency is distinct from 'BRL' then
    raise exception 'Novos lançamentos exigem reais (BRL); históricos não são convertidos.' using errcode='22023';
  end if;
  if not exists (
    select 1 from comprova.projects p
    join comprova.project_members pm on pm.company_id=p.company_id and pm.project_id=p.id
    join comprova.company_members m on m.company_id=pm.company_id and m.id=pm.member_id
    where p.company_id=p_company and p.id=p_project and p.active and m.active and m.user_id=p_owner
  ) then raise exception 'Selecione um projeto ativo vinculado ao autor.' using errcode='22023'; end if;
  if not exists (select 1 from comprova.payment_methods p
    where p.company_id=p_company and p.id=p_payment and p.active)
  then raise exception 'Selecione uma forma de pagamento ativa.' using errcode='22023'; end if;
end;
$$;
revoke all on function comprova.assert_reporting_dimensions(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;

create function comprova.prevent_new_report_cost_center()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.cost_center_id is not null and (tg_op='INSERT' or new.cost_center_id is distinct from old.cost_center_id) then
    raise exception 'Novos relatórios usam projeto, não centro de custo.' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function comprova.prevent_new_report_cost_center() from public,anon,authenticated;
create trigger comprova_no_new_report_cost_center before insert or update of cost_center_id on comprova.reports
for each row execute function comprova.prevent_new_report_cost_center();

create function comprova.validate_reporting_expense()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_report comprova.reports%rowtype;
begin
  select r.* into v_report from comprova.report_expenses re join comprova.reports r on r.id=re.report_id
    where re.expense_id=new.id;
  if not found and new.entry_source='ocr' then return new; end if;
  if not comprova.reporting_expense_fields_valid(new.amount,new.currency,new.description) then
    raise exception 'Informe descrição e valor estritamente positivo, com até dois decimais, em reais.' using errcode='22023';
  end if;
  if v_report.id is not null then
    perform comprova.assert_reporting_dimensions(v_report.company_id,v_report.owner_id,v_report.project_id,v_report.payment_method_id,v_report.currency);
    if not exists (select 1 from comprova.expense_categories c
      where c.company_id=v_report.company_id and c.active and c.name=new.category)
    then raise exception 'Selecione um tipo de despesa ativo da empresa.' using errcode='22023'; end if;
  end if;
  return new;
end;
$$;
revoke all on function comprova.validate_reporting_expense() from public,anon,authenticated;
create trigger comprova_reporting_expense_fields before insert or update of amount,currency,description,category,entry_source
  on comprova.expenses for each row execute function comprova.validate_reporting_expense();

create function comprova.validate_reporting_expense_link()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_report comprova.reports%rowtype; v_expense comprova.expenses%rowtype;
begin
  -- Existing lock_report_link serializes owner and status checks; validation also runs
  -- on direct PostgREST writes and inside the manual RPC, not only the HTTP form.
  select * into v_report from comprova.reports where id=new.report_id for update;
  select * into v_expense from comprova.expenses where id=new.expense_id for update;
  if v_report.owner_id is distinct from (select auth.uid()) or v_expense.user_id is distinct from v_report.owner_id
    or v_report.status not in ('draft','rejected')
  then raise exception 'Vínculo de despesa não autorizado.' using errcode='42501'; end if;
  perform comprova.assert_reporting_dimensions(v_report.company_id,v_report.owner_id,v_report.project_id,v_report.payment_method_id,v_report.currency);
  if not comprova.reporting_expense_fields_valid(v_expense.amount,v_expense.currency,v_expense.description) then
    raise exception 'Revise descrição, valor positivo e reais antes de vincular a extração.' using errcode='22023';
  end if;
  if not exists (select 1 from comprova.expense_categories c
    where c.company_id=v_report.company_id and c.active and c.name=v_expense.category)
  then raise exception 'Selecione um tipo de despesa ativo da empresa.' using errcode='22023'; end if;
  return new;
end;
$$;
revoke all on function comprova.validate_reporting_expense_link() from public,anon,authenticated;
create trigger comprova_reporting_expense_link before insert on comprova.report_expenses
  for each row execute function comprova.validate_reporting_expense_link();

create or replace function comprova.add_manual_report_expense(
  p_report_id uuid,p_supplier text,p_date date,p_amount numeric,p_category text,p_description text,p_receipt_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_report comprova.reports%rowtype; v_expense uuid; v_category text:=btrim(coalesce(p_category,''));
begin
  select * into v_report from comprova.reports where id=p_report_id for update;
  if not found or v_report.owner_id is distinct from (select auth.uid())
    or not comprova.is_company_member(v_report.company_id) or v_report.status not in ('draft','rejected')
  then raise exception 'O relatório não está disponível para incluir despesas.'; end if;
  perform comprova.assert_reporting_dimensions(v_report.company_id,v_report.owner_id,v_report.project_id,v_report.payment_method_id,v_report.currency);
  if not comprova.reporting_expense_fields_valid(p_amount,'BRL',p_description)
    or p_date is null or p_date>current_date or char_length(btrim(coalesce(p_supplier,''))) not between 1 and 160
    or char_length(v_category) not between 1 and 80
  then raise exception 'Confira fornecedor, categoria, data, descrição e valor positivo em reais.' using errcode='22023'; end if;
  if not exists (select 1 from comprova.expense_categories where company_id=v_report.company_id and active and name=v_category)
  then raise exception 'Escolha um tipo de despesa ativo da empresa.' using errcode='22023'; end if;
  if p_receipt_id is not null and not exists (
    select 1 from comprova.receipts where id=p_receipt_id and user_id=(select auth.uid()) and storage_bucket='comprova-documents'
  ) then raise exception 'Comprovante não encontrado.'; end if;
  if p_receipt_id is null and exists (select 1 from comprova.companies where id=v_report.company_id and require_receipt)
    then raise exception 'A empresa exige comprovante para esta despesa.'; end if;
  insert into comprova.expenses(receipt_id,user_id,supplier,expense_date,amount,currency,category,description,confidence,entry_source)
    values(p_receipt_id,(select auth.uid()),btrim(p_supplier),p_date,p_amount,'BRL',v_category,btrim(p_description),'alta','manual')
    returning id into v_expense;
  insert into comprova.report_expenses(report_id,expense_id,position)
    values(p_report_id,v_expense,coalesce((select max(position)+1 from comprova.report_expenses where report_id=p_report_id),0));
  return v_expense;
end;
$$;
revoke all on function comprova.add_manual_report_expense(uuid,text,date,numeric,text,text,uuid) from public,anon;
grant execute on function comprova.add_manual_report_expense(uuid,text,date,numeric,text,text,uuid) to authenticated;

-- One durable notification per final approval revision. No historical backfill.
create table comprova.approval_email_outbox (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references comprova.reports(id) on delete restrict,
  instance_id uuid not null references comprova.approval_instances(id) on delete restrict,
  attempt integer not null,
  recipient text,
  payload jsonb not null,
  status text not null default 'pending' check(status in ('pending','processing','retry','sent','failed')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  available_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  locked_until timestamptz,
  lease_token uuid,
  provider_message_id text,
  last_error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(report_id,instance_id,attempt)
);
create index comprova_approval_mail_ready_idx on comprova.approval_email_outbox(available_at,created_at)
  where status in ('pending','retry','processing');
alter table comprova.approval_email_outbox enable row level security;
revoke all on comprova.approval_email_outbox from public,anon,authenticated;

create function comprova.enqueue_approved_report_email()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_instance comprova.approval_instances%rowtype; v_email text;
begin
  if old.status='approved' or new.status<>'approved' then return new; end if;
  select * into v_instance from comprova.approval_instances where report_id=new.id;
  if old.status<>'submitted' or v_instance.status is distinct from 'approved'
    or v_instance.decided_by is distinct from (select auth.uid()) or not exists (
      select 1 from comprova.approval_decisions d where d.instance_id=v_instance.id
      and d.attempt=v_instance.attempt and d.step_order=v_instance.current_step
      and d.approver_user_id=(select auth.uid()) and d.decision='approve'
    ) then raise exception 'Aprovação final sem decisão autorizada.' using errcode='42501'; end if;
  -- Read the owner's verified Auth identity; never update or copy Auth identities.
  select email into v_email from auth.users where id=new.owner_id;
  insert into comprova.approval_email_outbox(report_id,instance_id,attempt,recipient,payload,status,last_error_code)
    values(new.id,v_instance.id,v_instance.attempt,v_email,
      jsonb_build_object('reportName',new.name,'reportCode',new.report_code,'totalAmount',new.total_amount,
        'currency',new.currency,'approvedAt',new.approved_at),
      case when nullif(btrim(v_email),'') is null then 'failed' else 'pending' end,
      case when nullif(btrim(v_email),'') is null then 'recipient_missing' end)
    on conflict(report_id,instance_id,attempt) do nothing;
  return new;
end;
$$;
revoke all on function comprova.enqueue_approved_report_email() from public,anon,authenticated;
create trigger comprova_approved_report_email after update of status on comprova.reports
  for each row execute function comprova.enqueue_approved_report_email();

-- Only the server worker's service_role may claim/finish jobs. No public enqueue API.
create function comprova.claim_approval_emails(p_limit integer default 10)
returns setof comprova.approval_email_outbox language plpgsql security definer set search_path='' as $$
begin
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'Lote inválido.'; end if;
  -- Provider keys expire after 24h. Never automatically resend an ambiguous request
  -- outside a conservative 23h window; reconciliation is then a human operation.
  update comprova.approval_email_outbox set status='failed',locked_until=null,lease_token=null,
    last_error_code='reconciliation_required'
    where status in ('pending','retry','processing') and
      ((first_attempt_at is not null and first_attempt_at<now()-interval '23 hours')
       or (attempts>=5 and (locked_until is null or locked_until<now())));
  return query
    with ready as (
      select id from comprova.approval_email_outbox
      where ((status in ('pending','retry') and available_at<=now())
        or (status='processing' and locked_until<now())) and attempts<5
      order by available_at,created_at for update skip locked limit p_limit
    )
    update comprova.approval_email_outbox o set status='processing',attempts=o.attempts+1,
      first_attempt_at=coalesce(o.first_attempt_at,now()),locked_until=now()+interval '2 minutes',lease_token=gen_random_uuid()
    from ready where o.id=ready.id returning o.*;
end;
$$;
revoke all on function comprova.claim_approval_emails(integer) from public,anon,authenticated;
grant execute on function comprova.claim_approval_emails(integer) to service_role;

create function comprova.finish_approval_email(
  p_id uuid,p_lease uuid,p_success boolean,p_retryable boolean default false,p_provider_id text default null,p_error_code text default null
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_success is null or p_retryable is null then raise exception 'Resultado inválido.'; end if;
  update comprova.approval_email_outbox set
    status=case when p_success then 'sent' when p_retryable and attempts<5 then 'retry' else 'failed' end,
    provider_message_id=case when p_success then left(p_provider_id,200) else provider_message_id end,
    sent_at=case when p_success then now() else null end,
    last_error_code=case when p_success then null when p_error_code in
      ('provider_unavailable','provider_rejected','invalid_message','recipient_missing') then p_error_code else 'provider_unavailable' end,
    available_at=now()+make_interval(secs=>least(3600,60*power(4,attempts-1)::integer)),
    locked_until=null,lease_token=null
  where id=p_id and lease_token=p_lease and status='processing';
  return found;
end;
$$;
revoke all on function comprova.finish_approval_email(uuid,uuid,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function comprova.finish_approval_email(uuid,uuid,boolean,boolean,text,text) to service_role;
