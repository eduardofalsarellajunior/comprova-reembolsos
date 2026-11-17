-- Sensitive company profiles. No Auth users are created, changed, or emailed.
-- Composite membership FK reuses the unique key in the preceding policy migration.

create table comprova.company_member_profiles (
  member_id uuid primary key,
  company_id uuid not null,
  full_name text check (length(full_name) <= 160),
  cpf text check (cpf ~ '^[0-9]{11}$'),
  birth_date date check (birth_date >= date '1900-01-01'),
  phone text check (length(phone) <= 40),
  job_label text check (length(job_label) <= 160),
  bank text check (length(bank) <= 120),
  bank_branch text check (length(bank_branch) <= 40),
  bank_account text check (length(bank_account) <= 60),
  pix_key text check (length(pix_key) <= 160),
  updated_at timestamptz not null default now(),
  foreign key (company_id, member_id) references comprova.company_members(company_id, id) on delete cascade
);
create index comprova_member_profiles_company_idx on comprova.company_member_profiles(company_id);

alter table comprova.company_member_profiles enable row level security;
revoke all on comprova.company_member_profiles from public, anon, authenticated;
grant select on comprova.company_member_profiles to authenticated;
create policy comprova_personal_profile_select on comprova.company_member_profiles for select to authenticated
using (
  comprova.is_company_admin(company_id) or exists (
    select 1 from comprova.company_members m
    where m.company_id = company_member_profiles.company_id and m.id = company_member_profiles.member_id
      and m.user_id = (select auth.uid()) and m.active
  )
);

-- Keep legacy financial assignments usable without allowing new legacy roles.
create function comprova.check_company_member_type()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role = 'finance' and (tg_op = 'INSERT' or old.role is distinct from new.role) then
    raise exception 'Novos tipos permitidos: Normal, Intermediário e Administrador.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function comprova.check_company_member_type() from public, anon, authenticated;
create trigger comprova_company_members_type_check before insert or update of role on comprova.company_members
for each row execute function comprova.check_company_member_type();

-- Internal helper; only called from the authorized owner-context functions below.
create function comprova.write_company_member_profile(p_company_id uuid, p_member_id uuid, p_profile jsonb, p_fill_only boolean)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_cpf text := nullif(btrim(p_profile->>'cpf'), '');
  v_birth_date date;
  v_rows integer;
begin
  if jsonb_typeof(p_profile) is distinct from 'object' then
    raise exception 'Dados de perfil inválidos.' using errcode = '22023';
  end if;
  if v_cpf is not null and v_cpf !~ '^([0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})$' then
    raise exception 'Informe um CPF com 11 dígitos.' using errcode = '22023';
  end if;
  v_cpf := regexp_replace(v_cpf, '[^0-9]', '', 'g');
  if nullif(p_profile->>'birth_date', '') is not null then
    if (p_profile->>'birth_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Data de nascimento inválida.' using errcode = '22023';
    end if;
    begin
      v_birth_date := (p_profile->>'birth_date')::date;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception 'Data de nascimento inválida.' using errcode = '22023';
    end;
    if v_birth_date > current_date or v_birth_date < date '1900-01-01' then
      raise exception 'Data de nascimento inválida.' using errcode = '22023';
    end if;
  end if;

  insert into comprova.company_member_profiles as saved (
    company_id, member_id, full_name, cpf, birth_date, phone, job_label, bank, bank_branch, bank_account, pix_key
  ) values (
    p_company_id, p_member_id, nullif(btrim(p_profile->>'full_name'), ''), v_cpf, v_birth_date,
    nullif(btrim(p_profile->>'phone'), ''), nullif(btrim(p_profile->>'job_label'), ''),
    nullif(btrim(p_profile->>'bank'), ''), nullif(btrim(p_profile->>'bank_branch'), ''),
    nullif(btrim(p_profile->>'bank_account'), ''), nullif(btrim(p_profile->>'pix_key'), '')
  )
  on conflict (member_id) do update set
    full_name = case when p_fill_only then coalesce(saved.full_name, excluded.full_name) else excluded.full_name end,
    cpf = case when p_fill_only then coalesce(saved.cpf, excluded.cpf) else excluded.cpf end,
    birth_date = case when p_fill_only then coalesce(saved.birth_date, excluded.birth_date) else excluded.birth_date end,
    phone = case when p_fill_only then coalesce(saved.phone, excluded.phone) else excluded.phone end,
    job_label = case when p_fill_only then coalesce(saved.job_label, excluded.job_label) else excluded.job_label end,
    bank = case when p_fill_only then coalesce(saved.bank, excluded.bank) else excluded.bank end,
    bank_branch = case when p_fill_only then coalesce(saved.bank_branch, excluded.bank_branch) else excluded.bank_branch end,
    bank_account = case when p_fill_only then coalesce(saved.bank_account, excluded.bank_account) else excluded.bank_account end,
    pix_key = case when p_fill_only then coalesce(saved.pix_key, excluded.pix_key) else excluded.pix_key end,
    updated_at = now()
  where saved.company_id = excluded.company_id and (
    not p_fill_only
    or (saved.full_name is null and excluded.full_name is not null)
    or (saved.cpf is null and excluded.cpf is not null)
    or (saved.birth_date is null and excluded.birth_date is not null)
    or (saved.phone is null and excluded.phone is not null)
    or (saved.job_label is null and excluded.job_label is not null)
    or (saved.bank is null and excluded.bank is not null)
    or (saved.bank_branch is null and excluded.bank_branch is not null)
    or (saved.bank_account is null and excluded.bank_account is not null)
    or (saved.pix_key is null and excluded.pix_key is not null)
  );
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;
revoke all on function comprova.write_company_member_profile(uuid, uuid, jsonb, boolean) from public, anon, authenticated;

create function comprova.update_company_member_profile(
  p_company_id uuid, p_member_id uuid, p_role text, p_department_id uuid, p_job_title_id uuid, p_profile jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not comprova.is_company_admin(p_company_id) then
    raise exception 'Somente administradores podem editar os dados da equipe.' using errcode = '42501';
  end if;
  -- Existing RPC protects owner, actor role, tenant scope and department/job consistency.
  perform comprova.update_company_member_assignment(p_company_id, p_member_id, p_role, p_department_id, p_job_title_id);
  perform comprova.write_company_member_profile(p_company_id, p_member_id, p_profile, false);
end;
$$;
revoke all on function comprova.update_company_member_profile(uuid, uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function comprova.update_company_member_profile(uuid, uuid, text, uuid, uuid, jsonb) to authenticated;

create function comprova.import_company_members(p_company_id uuid, p_rows jsonb, p_commit boolean, p_confirm_admins boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_role text;
  v_email text;
  v_member uuid;
  v_saved_role text;
  v_new integer := 0;
  v_existing integer := 0;
  v_existing_types_preserved integer := 0;
  v_new_admins integer := 0;
  v_profiles_filled integer := 0;
  v_seen text[] := '{}'::text[];
begin
  if (select auth.uid()) is null or not comprova.is_company_admin(p_company_id) then
    raise exception 'Somente administradores podem importar membros.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or p_commit is null then
    raise exception 'Importação inválida.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 200 or octet_length(p_rows::text) > 250000 then
    raise exception 'A importação deve conter entre 1 e 200 membros.' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_email := lower(btrim(coalesce(v_item->>'email', '')));
    v_role := v_item->>'role';
    if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or v_email = any(v_seen)
      or v_role is null or v_role not in ('employee','approver','admin')
      or nullif(btrim(v_item->>'full_name'), '') is null
    then
      raise exception 'E-mail duplicado ou cadastro inválido.' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_email);
    select id, role into v_member, v_saved_role from comprova.company_members
    where company_id = p_company_id and email = v_email;
    if not found then
      if v_role = 'admin' and p_commit and p_confirm_admins is distinct from true then
        raise exception 'Confirme a inclusão de novas contas administrativas.' using errcode = '22023';
      end if;
      if p_commit then
        insert into comprova.company_members(company_id,email,role)
        values (p_company_id,v_email,v_role) on conflict (company_id,email) do nothing
        returning id into v_member;
        if v_member is null then
          -- Competing inserts never lead to a role overwrite.
          select id, role into v_member, v_saved_role from comprova.company_members
          where company_id = p_company_id and email = v_email;
          if v_member is null then raise exception 'Cadastro mudou durante a importação. Tente novamente.' using errcode = '40001'; end if;
        end if;
      end if;
      if v_saved_role is null then
        v_new := v_new + 1;
        if v_role = 'admin' then v_new_admins := v_new_admins + 1; end if;
      end if;
    end if;
    if v_saved_role is not null then
      v_existing := v_existing + 1;
      if v_saved_role <> v_role then v_existing_types_preserved := v_existing_types_preserved + 1; end if;
    end if;
    if p_commit and comprova.write_company_member_profile(p_company_id, v_member, v_item, true) then
      v_profiles_filled := v_profiles_filled + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'rows', jsonb_array_length(p_rows), 'newMembers', v_new, 'existingMembers', v_existing,
    'typesPreserved', v_existing_types_preserved, 'newAdmins', v_new_admins, 'profilesFilled', v_profiles_filled
  );
end;
$$;
revoke all on function comprova.import_company_members(uuid, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function comprova.import_company_members(uuid, jsonb, boolean, boolean) to authenticated;
