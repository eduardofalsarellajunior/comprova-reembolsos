-- Company-scoped organizational settings. No changes to shared auth or Storage.

create table comprova.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references comprova.companies(id) on delete cascade,
  name text not null check (name = btrim(name) and length(name) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
create unique index comprova_departments_company_name_idx on comprova.departments(company_id, lower(name));

create table comprova.job_titles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  department_id uuid not null,
  name text not null check (name = btrim(name) and length(name) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (company_id, department_id, id),
  foreign key (company_id, department_id) references comprova.departments(company_id,id) on delete cascade
);
create unique index comprova_job_titles_department_name_idx
  on comprova.job_titles(company_id, department_id, lower(name));

alter table comprova.company_members
  add column department_id uuid,
  add column job_title_id uuid,
  add constraint comprova_member_title_requires_department check (job_title_id is null or department_id is not null),
  add constraint comprova_member_department_fk foreign key (company_id,department_id)
    references comprova.departments(company_id,id) on delete restrict,
  add constraint comprova_member_job_title_fk foreign key (company_id,department_id,job_title_id)
    references comprova.job_titles(company_id,department_id,id) on delete restrict;
create index comprova_members_classification_idx on comprova.company_members(company_id,department_id,job_title_id);

create table comprova.mileage_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references comprova.companies(id) on delete cascade,
  name text not null check (name = btrim(name) and length(name) between 1 and 160),
  rate_per_km numeric(12,4) not null check (rate_per_km > 0 and rate_per_km <> 'NaN'::numeric),
  max_km numeric(12,2) check (max_km > 0 and max_km <> 'NaN'::numeric),
  requires_route boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table comprova.mileage_policies is 'Saved policies only; no automatic mileage calculations or payments.';
create unique index comprova_mileage_policies_company_name_idx
  on comprova.mileage_policies(company_id, lower(name));

alter table comprova.departments enable row level security;
alter table comprova.job_titles enable row level security;
alter table comprova.mileage_policies enable row level security;

create policy comprova_departments_read on comprova.departments for select to authenticated
  using (comprova.is_company_member(company_id));
create policy comprova_departments_manage on comprova.departments for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));
create policy comprova_job_titles_read on comprova.job_titles for select to authenticated
  using (comprova.is_company_member(company_id));
create policy comprova_job_titles_manage on comprova.job_titles for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));
create policy comprova_mileage_policies_read on comprova.mileage_policies for select to authenticated
  using (comprova.is_company_member(company_id));
create policy comprova_mileage_policies_manage on comprova.mileage_policies for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));

revoke all on table comprova.departments, comprova.job_titles, comprova.mileage_policies from public, anon, authenticated;
grant select,delete on table comprova.departments, comprova.job_titles, comprova.mileage_policies to authenticated;
grant insert(company_id,name),update(name) on comprova.departments to authenticated;
grant insert(company_id,department_id,name),update(name) on comprova.job_titles to authenticated;
grant insert(company_id,name,rate_per_km,max_km,requires_route,active),
  update(name,rate_per_km,max_km,requires_route,active) on comprova.mileage_policies to authenticated;
revoke insert,update,delete on table comprova.company_members from public, anon, authenticated;

create function comprova.update_company_member_assignment(
  p_company_id uuid, p_member_id uuid, p_role text, p_department_id uuid, p_job_title_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_member comprova.company_members%rowtype;
begin
  if v_actor is null or not comprova.is_company_admin(p_company_id) then
    raise exception 'Somente administradores podem alterar membros da equipe.' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin','approver','employee','finance') then
    raise exception 'Tipo de conta inválido.' using errcode = '22023';
  end if;

  select * into v_member from comprova.company_members
  where id=p_member_id and company_id=p_company_id for update;
  if not found then
    raise exception 'Membro não encontrado nesta empresa.' using errcode = '22023';
  end if;
  if p_role <> 'admin' and exists (
    select 1 from comprova.companies c where c.id=p_company_id and c.owner_id=v_member.user_id
  ) then
    raise exception 'O proprietário da empresa deve permanecer administrador.' using errcode = '42501';
  end if;
  if v_member.user_id = v_actor and p_role <> v_member.role then
    raise exception 'O próprio tipo de conta não pode ser alterado.' using errcode = '42501';
  end if;

  if p_department_id is not null and not exists (
    select 1 from comprova.departments d where d.id=p_department_id and d.company_id=p_company_id
  ) then
    raise exception 'Departamento não encontrado nesta empresa.' using errcode = '22023';
  end if;
  if p_job_title_id is not null and not exists (
    select 1 from comprova.job_titles j
    where j.id=p_job_title_id and j.company_id=p_company_id and j.department_id=p_department_id
  ) then
    raise exception 'O cargo não pertence ao departamento selecionado.' using errcode = '22023';
  end if;

  update comprova.company_members set role=p_role, department_id=p_department_id, job_title_id=p_job_title_id
  where id=p_member_id and company_id=p_company_id;
end;
$$;
revoke all on function comprova.update_company_member_assignment(uuid,uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function comprova.update_company_member_assignment(uuid,uuid,text,uuid,uuid) to authenticated;

-- Keep the existing onboarding API, but prevent the invitation upsert from
-- changing an existing member's role or activation state outside the management RPCs.
create or replace function comprova.invite_company_member(p_company_id uuid,p_email text,p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_member uuid; v_email text := lower(btrim(coalesce(p_email,'')));
begin
  if (select auth.uid()) is null or not comprova.is_company_admin(p_company_id) then
    raise exception 'Somente administradores podem incluir membros.' using errcode = '42501';
  end if;
  if v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then raise exception 'E-mail inválido.'; end if;
  if p_role is null or p_role not in ('admin','approver','employee','finance') then
    raise exception 'Tipo de conta inválido.' using errcode = '22023';
  end if;
  insert into comprova.company_members(company_id,email,role) values (p_company_id,v_email,p_role)
    on conflict (company_id,email) do nothing returning id into v_member;
  if v_member is null then
    raise exception 'Este e-mail já está cadastrado. Ajuste as permissões no cadastro do membro.' using errcode = '23505';
  end if;
  return v_member;
end;
$$;

-- Internal template helpers are not callable by the Data API.
create function comprova.is_inepad_catalog_name(p_name text)
returns boolean language sql immutable set search_path = '' as $$
  select upper(regexp_replace(btrim(coalesce(p_name,'')), '[[:space:]]+', ' ', 'g')) in (
    'INEPAD','INEPAD LTDA','INEPAD LTDA.','INEPAD CONSULTING','INEPAD CONSULTING LTDA','INEPAD CONSULTING LTDA.'
  )
$$;
revoke all on function comprova.is_inepad_catalog_name(text) from public, anon, authenticated;

create function comprova.insert_inepad_catalog(p_company_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare v_departments integer; v_jobs integer;
begin
  insert into comprova.departments(company_id,name)
    values (p_company_id,'Administrativo'),(p_company_id,'Comercial'),(p_company_id,'Operações')
    on conflict (company_id, lower(name)) do nothing;
  get diagnostics v_departments = row_count;

  insert into comprova.job_titles(company_id,department_id,name)
  select p_company_id,d.id,template.job_name from (values
    ('Administrativo','Analista Administrativo Financeiro'),
    ('Administrativo','Assistente Administrativo Financeiro'),
    ('Administrativo','Diretor Administrativo Financeiro'),
    ('Administrativo','Estagiário Administrativo Financeiro'),
    ('Administrativo','Motoristas'),
    ('Administrativo','Secretária Executiva'),
    ('Administrativo','Supervisor Administrativo Financeiro'),
    ('Administrativo','Trainee'),
    ('Comercial','Analista Comercial'),
    ('Comercial','Assistente Comercial'),
    ('Comercial','Consultor Comercial'),
    ('Comercial','Diretor Comercial'),
    ('Comercial','Estagiário Comercial'),
    ('Comercial','Supervisor Comercial'),
    ('Operações','Analista Consultoria'),
    ('Operações','Consultor Externo'),
    ('Operações','Diretor Controladoria'),
    ('Operações','Diretor de Projetos'),
    ('Operações','Diretor Presidente'),
    ('Operações','Estagiário Consultoria'),
    ('Operações','Motoristas'),
    ('Operações','Supervisor Consultoria'),
    ('Operações','Trainee Consultoria')
  ) as template(dept_name,job_name)
  join comprova.departments d on d.company_id=p_company_id and lower(d.name)=lower(template.dept_name)
  on conflict (company_id, department_id, lower(name)) do nothing;
  get diagnostics v_jobs = row_count;

  return jsonb_build_object('departments',v_departments,'job_titles',v_jobs);
end;
$$;
revoke all on function comprova.insert_inepad_catalog(uuid) from public, anon, authenticated;

create function comprova.seed_inepad_departments(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not comprova.is_company_admin(p_company_id) then
    raise exception 'Somente administradores podem importar departamentos e cargos.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from comprova.companies c where c.id=p_company_id
      and (coalesce(c.name,'') ~* '\mINEPAD\M' or coalesce(c.legal_name,'') ~* '\mINEPAD\M')
  ) then
    raise exception 'O catálogo está disponível apenas para a empresa INEPAD.' using errcode = '22023';
  end if;
  return comprova.insert_inepad_catalog(p_company_id);
end;
$$;
revoke all on function comprova.seed_inepad_departments(uuid) from public, anon, authenticated;
grant execute on function comprova.seed_inepad_departments(uuid) to authenticated;

-- Preload the confirmed existing organization, but never guess among matches.
do $$
declare v_matches uuid[];
begin
  select array_agg(c.id) into v_matches from comprova.companies c
  where comprova.is_inepad_catalog_name(c.name) or comprova.is_inepad_catalog_name(c.legal_name);
  if cardinality(v_matches) = 1 then perform comprova.insert_inepad_catalog(v_matches[1]); end if;
end;
$$;

create function comprova.seed_new_inepad_company()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (comprova.is_inepad_catalog_name(new.name) or comprova.is_inepad_catalog_name(new.legal_name))
      and not exists (
        select 1 from comprova.companies c where c.id<>new.id
        and (comprova.is_inepad_catalog_name(c.name) or comprova.is_inepad_catalog_name(c.legal_name))
      ) then
    perform comprova.insert_inepad_catalog(new.id);
  end if;
  return new;
end;
$$;
revoke all on function comprova.seed_new_inepad_company() from public, anon, authenticated;
create trigger comprova_companies_seed_inepad_catalog after insert on comprova.companies
  for each row execute function comprova.seed_new_inepad_company();
