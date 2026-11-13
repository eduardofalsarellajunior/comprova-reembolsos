-- COMPROVA: configuração da empresa, equipe e classificações.
-- Restrito ao schema comprova; a única política fora dele é limitada ao bucket comprova-documents.

create table if not exists comprova.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 160),
  legal_name text not null default '',
  tax_id text not null default '',
  brand_color text not null default '#147D64' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  report_prefix text not null default 'RMB',
  default_currency text not null default 'BRL',
  require_cost_center boolean not null default true,
  require_receipt boolean not null default true,
  allow_self_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists comprova.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references comprova.companies(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('admin','approver','employee','finance')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  unique (company_id, email),
  unique (company_id, user_id)
);
create index if not exists comprova_company_members_user_idx on comprova.company_members(user_id, active);

create or replace function comprova.is_company_member(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from comprova.company_members m
    where m.company_id = p_company_id and m.user_id = (select auth.uid()) and m.active
  );
$$;
create or replace function comprova.is_company_admin(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from comprova.company_members m
    where m.company_id = p_company_id and m.user_id = (select auth.uid()) and m.active and m.role = 'admin'
  );
$$;
revoke all on function comprova.is_company_member(uuid), comprova.is_company_admin(uuid) from public;
grant execute on function comprova.is_company_member(uuid), comprova.is_company_admin(uuid) to authenticated;

create or replace function comprova.create_company(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid; v_email text;
begin
  if (select auth.uid()) is null then raise exception 'Sessão inválida.'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Informe o nome da empresa.'; end if;
  select lower(email) into v_email from auth.users where id = (select auth.uid()) and email_confirmed_at is not null;
  if v_email is null then raise exception 'Confirme seu e-mail antes de criar a empresa.'; end if;
  if exists (select 1 from comprova.companies where owner_id = (select auth.uid())) then raise exception 'Sua empresa já foi criada.'; end if;
  insert into comprova.companies(owner_id,name) values ((select auth.uid()),trim(p_name)) returning id into v_company;
  insert into comprova.company_members(company_id,email,user_id,role,joined_at)
    values (v_company,v_email,(select auth.uid()),'admin',now());
  return v_company;
end;
$$;
revoke all on function comprova.create_company(text) from public;
grant execute on function comprova.create_company(text) to authenticated;

create or replace function comprova.invite_company_member(p_company_id uuid,p_email text,p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_email text := lower(trim(coalesce(p_email,'')));
begin
  if not comprova.is_company_admin(p_company_id) then raise exception 'Somente administradores podem incluir membros.'; end if;
  if v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then raise exception 'E-mail inválido.'; end if;
  if p_role not in ('admin','approver','employee','finance') then raise exception 'Perfil inválido.'; end if;
  if p_role <> 'admin' and exists (
    select 1 from comprova.companies c join auth.users u on u.id=c.owner_id
    where c.id=p_company_id and lower(u.email)=v_email
  ) then raise exception 'O proprietário da empresa deve permanecer administrador.'; end if;
  insert into comprova.company_members(company_id,email,role)
    values (p_company_id,v_email,p_role)
    on conflict (company_id,email) do update set role = excluded.role, active = true
    returning id into v_member;
  return v_member;
end;
$$;
revoke all on function comprova.invite_company_member(uuid,text,text) from public;
grant execute on function comprova.invite_company_member(uuid,text,text) to authenticated;

create or replace function comprova.claim_company_invitations()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_email text; v_count integer;
begin
  if (select auth.uid()) is null then raise exception 'Sessão inválida.'; end if;
  select lower(email) into v_email from auth.users where id = (select auth.uid()) and email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  update comprova.company_members set user_id = (select auth.uid()), joined_at = now()
  where email = v_email and user_id is null and active;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function comprova.claim_company_invitations() from public;
grant execute on function comprova.claim_company_invitations() to authenticated;

create table if not exists comprova.cost_centers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references comprova.companies(id) on delete cascade,
  code text not null default '', name text not null, active boolean not null default true,
  created_at timestamptz not null default now(), unique(company_id,name)
);
create table if not exists comprova.projects (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references comprova.companies(id) on delete cascade,
  code text not null default '', name text not null, active boolean not null default true,
  created_at timestamptz not null default now(), unique(company_id,name)
);
create table if not exists comprova.payment_methods (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references comprova.companies(id) on delete cascade,
  name text not null, reimbursable boolean not null default true, active boolean not null default true,
  created_at timestamptz not null default now(), unique(company_id,name)
);
create table if not exists comprova.expense_categories (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references comprova.companies(id) on delete cascade,
  name text not null, active boolean not null default true,
  created_at timestamptz not null default now(), unique(company_id,name)
);

alter table comprova.reports add column if not exists company_id uuid references comprova.companies(id);
alter table comprova.reports add column if not exists cost_center_id uuid references comprova.cost_centers(id);
alter table comprova.reports add column if not exists project_id uuid references comprova.projects(id);
alter table comprova.reports add column if not exists payment_method_id uuid references comprova.payment_methods(id);
alter table comprova.reports add column if not exists notes text not null default '';
alter table comprova.reports add column if not exists approval_flow_id uuid references comprova.approval_flows(id);
alter table comprova.approval_flows add column if not exists company_id uuid references comprova.companies(id);
alter table comprova.policy_rules add column if not exists company_id uuid references comprova.companies(id);
alter table comprova.companies add column default_approval_flow_id uuid references comprova.approval_flows(id);
alter table comprova.cost_centers add column approval_flow_id uuid references comprova.approval_flows(id);

create or replace function comprova.set_company_member_active(p_company_id uuid,p_member_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member comprova.company_members%rowtype;
begin
  if not comprova.is_company_admin(p_company_id) then raise exception 'Somente administradores podem alterar acessos.'; end if;
  select * into v_member from comprova.company_members where id=p_member_id and company_id=p_company_id for update;
  if not found or p_active is null then raise exception 'Membro não encontrado.'; end if;
  if not p_active and exists (select 1 from comprova.companies c where c.id=p_company_id and c.owner_id=v_member.user_id)
    then raise exception 'O acesso do proprietário não pode ser desativado.'; end if;
  update comprova.company_members set active=p_active where id=p_member_id;
end;
$$;
revoke all on function comprova.set_company_member_active(uuid,uuid,boolean) from public;
grant execute on function comprova.set_company_member_active(uuid,uuid,boolean) to authenticated;

create index if not exists comprova_reports_company_status_idx on comprova.reports(company_id,status,updated_at desc);
create index if not exists comprova_flows_company_idx on comprova.approval_flows(company_id,active);
create index if not exists comprova_rules_company_idx on comprova.policy_rules(company_id,active);
create index if not exists comprova_centers_company_idx on comprova.cost_centers(company_id,active);
create index if not exists comprova_projects_company_idx on comprova.projects(company_id,active);
create index if not exists comprova_methods_company_idx on comprova.payment_methods(company_id,active);
create index if not exists comprova_categories_company_idx on comprova.expense_categories(company_id,active);

alter table comprova.companies enable row level security;
alter table comprova.company_members enable row level security;
alter table comprova.cost_centers enable row level security;
alter table comprova.projects enable row level security;
alter table comprova.payment_methods enable row level security;
alter table comprova.expense_categories enable row level security;

create policy comprova_companies_select on comprova.companies for select to authenticated
  using (comprova.is_company_member(id));
create policy comprova_companies_update on comprova.companies for update to authenticated
  using (comprova.is_company_admin(id)) with check (comprova.is_company_admin(id));
create policy comprova_members_select on comprova.company_members for select to authenticated
  using (user_id = (select auth.uid()) or comprova.is_company_admin(company_id));

create policy comprova_centers_select on comprova.cost_centers for select to authenticated using (comprova.is_company_member(company_id));
create policy comprova_centers_write on comprova.cost_centers for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));
create policy comprova_projects_select on comprova.projects for select to authenticated using (comprova.is_company_member(company_id));
create policy comprova_projects_write on comprova.projects for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));
create policy comprova_methods_select on comprova.payment_methods for select to authenticated using (comprova.is_company_member(company_id));
create policy comprova_methods_write on comprova.payment_methods for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));
create policy comprova_categories_select on comprova.expense_categories for select to authenticated using (comprova.is_company_member(company_id));
create policy comprova_categories_write on comprova.expense_categories for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));

grant select on comprova.companies to authenticated;
grant update(name,legal_name,tax_id,brand_color,report_prefix,default_currency,require_cost_center,require_receipt,allow_self_approval,default_approval_flow_id,updated_at)
  on comprova.companies to authenticated;
grant select on comprova.company_members to authenticated;
grant select,insert,update,delete on comprova.cost_centers,comprova.projects,comprova.payment_methods,comprova.expense_categories to authenticated;

-- Novo caminho de upload: auth.uid()/arquivo. Mantém leitura dos caminhos legados do usuário mapeado.
drop policy if exists comprova_storage_select on storage.objects;
create policy comprova_storage_select on storage.objects for select to authenticated using (
  bucket_id in ('comprova-uploads','comprova-documents','comprova-recordings')
  and (split_part(name,'/',1) = (select auth.uid())::text or exists (
    select 1 from comprova.user_map m where m.destination_user_id = (select auth.uid())
      and split_part(name,'/',1) = m.source_user_id::text
  ))
);
drop policy if exists comprova_storage_insert on storage.objects;
create policy comprova_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('comprova-uploads','comprova-documents','comprova-recordings')
  and split_part(name,'/',1) = (select auth.uid())::text
);
drop policy if exists comprova_storage_update on storage.objects;
create policy comprova_storage_update on storage.objects for update to authenticated
  using (bucket_id in ('comprova-uploads','comprova-documents','comprova-recordings') and split_part(name,'/',1) = (select auth.uid())::text)
  with check (bucket_id in ('comprova-uploads','comprova-documents','comprova-recordings') and split_part(name,'/',1) = (select auth.uid())::text);
drop policy if exists comprova_storage_delete on storage.objects;
create policy comprova_storage_delete on storage.objects for delete to authenticated using (
  bucket_id in ('comprova-uploads','comprova-documents','comprova-recordings') and split_part(name,'/',1) = (select auth.uid())::text
);
