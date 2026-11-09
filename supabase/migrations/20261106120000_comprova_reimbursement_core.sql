create schema if not exists comprova;

create table if not exists comprova.reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','in_review','submitted','approved','rejected','paid','cancelled')),
  currency text not null default 'BRL',
  period_start date,
  period_end date,
  total_amount numeric(14,2) not null default 0,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz
);

create index if not exists comprova_reports_owner_status_idx
  on comprova.reports(owner_id, status, updated_at desc);

create table if not exists comprova.report_expenses (
  report_id uuid not null references comprova.reports(id) on delete cascade,
  expense_id uuid not null references comprova.expenses(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (report_id, expense_id),
  unique (expense_id)
);

create index if not exists comprova_report_expenses_report_idx
  on comprova.report_expenses(report_id, position);

create table if not exists comprova.approval_flows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists comprova.approval_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references comprova.approval_flows(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  approver_user_id uuid not null references auth.users(id) on delete restrict,
  required boolean not null default true,
  unique (flow_id, step_order, approver_user_id)
);

create table if not exists comprova.approval_instances (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references comprova.reports(id) on delete cascade,
  flow_id uuid not null references comprova.approval_flows(id) on delete restrict,
  current_step integer not null default 1,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists comprova.policy_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  category text,
  max_amount numeric(14,2),
  requires_receipt boolean not null default true,
  max_days_after_expense integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists comprova.policy_violations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references comprova.reports(id) on delete cascade,
  expense_id uuid references comprova.expenses(id) on delete cascade,
  rule_id uuid references comprova.policy_rules(id) on delete set null,
  code text not null,
  severity text not null default 'warning' check (severity in ('warning','blocking')),
  message text not null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (report_id is not null or expense_id is not null)
);

create index if not exists comprova_policy_violations_report_idx
  on comprova.policy_violations(report_id, severity, resolved_at);

create table if not exists comprova.identity_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('azure','email')),
  provider_subject text,
  tenant_id text,
  email text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (provider, provider_subject),
  unique (user_id, provider)
);

create table if not exists comprova.integration_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  provider text not null check (provider in ('conta_azul')),
  company_name text not null default '',
  external_company_id text,
  status text not null default 'pending' check (status in ('pending','connected','expired','revoked','error')),
  token_reference text,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  oauth_state_hash text unique,
  oauth_state_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider, external_company_id)
);

create table if not exists comprova.accounting_mappings (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references comprova.integration_connections(id) on delete cascade,
  mapping_kind text not null check (mapping_kind in ('category','cost_center','supplier','financial_account','payment_method')),
  local_key text not null,
  local_label text not null default '',
  external_id text not null,
  external_label text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, mapping_kind, local_key)
);

create table if not exists comprova.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references comprova.integration_connections(id) on delete cascade,
  report_id uuid references comprova.reports(id) on delete cascade,
  job_type text not null check (job_type in ('export_report','reconcile_report','refresh_metadata')),
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','dead_letter','cancelled')),
  attempts integer not null default 0,
  idempotency_key text not null unique,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comprova_sync_jobs_queue_idx
  on comprova.sync_jobs(status, next_attempt_at, created_at);

create table if not exists comprova.sync_events (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid not null references comprova.sync_jobs(id) on delete cascade,
  event_type text not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists comprova.external_records (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references comprova.integration_connections(id) on delete cascade,
  entity_type text not null check (entity_type in ('report','expense','supplier','category','cost_center','financial_account')),
  local_id uuid,
  external_id text not null,
  status text not null default 'active',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, entity_type, local_id),
  unique (connection_id, entity_type, external_id)
);

create table if not exists comprova.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists comprova_audit_events_entity_idx
  on comprova.audit_events(entity_type, entity_id, created_at desc);

create or replace function comprova.recalculate_report_total()
returns trigger
language plpgsql
set search_path = pg_catalog, comprova
as $$
begin
  update comprova.reports
  set total_amount = coalesce((
    select sum(coalesce(e.amount, 0))
    from comprova.report_expenses re
    join comprova.expenses e on e.id = re.expense_id
    where re.report_id = coalesce(new.report_id, old.report_id)
  ), 0), updated_at = now()
  where id = coalesce(new.report_id, old.report_id);
  return null;
end;
$$;

drop trigger if exists comprova_report_expenses_total_trigger on comprova.report_expenses;
create trigger comprova_report_expenses_total_trigger
after insert or update or delete on comprova.report_expenses
for each row execute function comprova.recalculate_report_total();

alter table comprova.reports enable row level security;
alter table comprova.report_expenses enable row level security;
alter table comprova.approval_flows enable row level security;
alter table comprova.approval_steps enable row level security;
alter table comprova.approval_instances enable row level security;
alter table comprova.policy_rules enable row level security;
alter table comprova.policy_violations enable row level security;
alter table comprova.identity_links enable row level security;
alter table comprova.integration_connections enable row level security;
alter table comprova.accounting_mappings enable row level security;
alter table comprova.sync_jobs enable row level security;
alter table comprova.sync_events enable row level security;
alter table comprova.external_records enable row level security;
alter table comprova.audit_events enable row level security;

drop policy if exists comprova_reports_select on comprova.reports;
create policy comprova_reports_select on comprova.reports for select to authenticated
using ((select auth.uid()) = owner_id or exists (
  select 1 from comprova.approval_instances ai
  join comprova.approval_steps aps on aps.flow_id = ai.flow_id and aps.step_order = ai.current_step
  where ai.report_id = reports.id and aps.approver_user_id = (select auth.uid())
));

drop policy if exists comprova_reports_insert on comprova.reports;
create policy comprova_reports_insert on comprova.reports for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists comprova_reports_update on comprova.reports;
create policy comprova_reports_update on comprova.reports for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists comprova_reports_delete on comprova.reports;
create policy comprova_reports_delete on comprova.reports for delete to authenticated
using ((select auth.uid()) = owner_id and status in ('draft','rejected','cancelled'));

drop policy if exists comprova_report_expenses_select on comprova.report_expenses;
create policy comprova_report_expenses_select on comprova.report_expenses for select to authenticated
using (exists (select 1 from comprova.reports r where r.id = report_expenses.report_id and (r.owner_id = (select auth.uid()) or exists (
  select 1 from comprova.approval_instances ai
  join comprova.approval_steps aps on aps.flow_id = ai.flow_id and aps.step_order = ai.current_step
  where ai.report_id = r.id and aps.approver_user_id = (select auth.uid())
))));

drop policy if exists comprova_report_expenses_insert on comprova.report_expenses;
create policy comprova_report_expenses_insert on comprova.report_expenses for insert to authenticated
with check (exists (select 1 from comprova.reports r join comprova.expenses e on e.id = report_expenses.expense_id where r.id = report_expenses.report_id and r.owner_id = (select auth.uid()) and e.user_id = (select auth.uid()) and r.status in ('draft','rejected')));

drop policy if exists comprova_report_expenses_delete on comprova.report_expenses;
create policy comprova_report_expenses_delete on comprova.report_expenses for delete to authenticated
using (exists (select 1 from comprova.reports r where r.id = report_expenses.report_id and r.owner_id = (select auth.uid()) and r.status in ('draft','rejected')));

drop policy if exists comprova_approval_flows_owner on comprova.approval_flows;
create policy comprova_approval_flows_owner on comprova.approval_flows for all to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists comprova_approval_steps_access on comprova.approval_steps;
create policy comprova_approval_steps_access on comprova.approval_steps for all to authenticated
using (exists (select 1 from comprova.approval_flows f where f.id = approval_steps.flow_id and f.owner_id = (select auth.uid())) or approver_user_id = (select auth.uid()))
with check (exists (select 1 from comprova.approval_flows f where f.id = approval_steps.flow_id and f.owner_id = (select auth.uid())));

drop policy if exists comprova_approval_instances_access on comprova.approval_instances;
create policy comprova_approval_instances_access on comprova.approval_instances for all to authenticated
using (exists (select 1 from comprova.reports r where r.id = approval_instances.report_id and r.owner_id = (select auth.uid())) or exists (
  select 1 from comprova.approval_steps s where s.flow_id = approval_instances.flow_id and s.step_order = approval_instances.current_step and s.approver_user_id = (select auth.uid())
))
with check (exists (select 1 from comprova.reports r where r.id = approval_instances.report_id and r.owner_id = (select auth.uid())) or exists (
  select 1 from comprova.approval_steps s where s.flow_id = approval_instances.flow_id and s.step_order = approval_instances.current_step and s.approver_user_id = (select auth.uid())
));

drop policy if exists comprova_policy_rules_owner on comprova.policy_rules;
create policy comprova_policy_rules_owner on comprova.policy_rules for all to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists comprova_policy_violations_access on comprova.policy_violations;
create policy comprova_policy_violations_access on comprova.policy_violations for all to authenticated
using (exists (select 1 from comprova.reports r where r.id = policy_violations.report_id and r.owner_id = (select auth.uid())) or exists (select 1 from comprova.expenses e where e.id = policy_violations.expense_id and e.user_id = (select auth.uid())))
with check (exists (select 1 from comprova.reports r where r.id = policy_violations.report_id and r.owner_id = (select auth.uid())) or exists (select 1 from comprova.expenses e where e.id = policy_violations.expense_id and e.user_id = (select auth.uid())));

drop policy if exists comprova_identity_links_owner on comprova.identity_links;
create policy comprova_identity_links_owner on comprova.identity_links for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists comprova_integration_connections_owner on comprova.integration_connections;
create policy comprova_integration_connections_owner on comprova.integration_connections for all to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

drop policy if exists comprova_accounting_mappings_owner on comprova.accounting_mappings;
create policy comprova_accounting_mappings_owner on comprova.accounting_mappings for all to authenticated
using (exists (select 1 from comprova.integration_connections c where c.id = accounting_mappings.connection_id and c.owner_id = (select auth.uid())))
with check (exists (select 1 from comprova.integration_connections c where c.id = accounting_mappings.connection_id and c.owner_id = (select auth.uid())));

drop policy if exists comprova_sync_jobs_owner on comprova.sync_jobs;
create policy comprova_sync_jobs_owner on comprova.sync_jobs for select to authenticated
using (exists (select 1 from comprova.integration_connections c where c.id = sync_jobs.connection_id and c.owner_id = (select auth.uid())));

drop policy if exists comprova_sync_events_owner on comprova.sync_events;
create policy comprova_sync_events_owner on comprova.sync_events for select to authenticated
using (exists (select 1 from comprova.sync_jobs j join comprova.integration_connections c on c.id = j.connection_id where j.id = sync_events.sync_job_id and c.owner_id = (select auth.uid())));

drop policy if exists comprova_external_records_owner on comprova.external_records;
create policy comprova_external_records_owner on comprova.external_records for select to authenticated
using (exists (select 1 from comprova.integration_connections c where c.id = external_records.connection_id and c.owner_id = (select auth.uid())));

drop policy if exists comprova_audit_events_owner on comprova.audit_events;
create policy comprova_audit_events_owner on comprova.audit_events for select to authenticated
using ((select auth.uid()) = actor_user_id);

grant usage on schema comprova to authenticated;
grant select, insert, update, delete on all tables in schema comprova to authenticated;
grant usage, select on all sequences in schema comprova to authenticated;
