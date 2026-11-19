-- Additive self-service profile endpoint; do not broaden table privileges or RLS.
-- Login email, Auth identities, account type, activation and approval/project links
-- remain outside this contract. Membership is always derived from the session.
create function comprova.update_my_company_member_profile(
  p_company_id uuid, p_department_id uuid, p_job_title_id uuid, p_profile jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_member uuid;
begin
  if v_actor is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  -- Serialize with administrative deactivation/reassignment of this same member.
  select m.id into v_member from comprova.company_members m
  where m.company_id = p_company_id and m.user_id = v_actor and m.active
  for update;
  if not found then
    raise exception 'É necessário um vínculo ativo com esta empresa.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_profile) is distinct from 'object' then
    raise exception 'Dados de perfil inválidos.' using errcode = '22023';
  end if;
  if octet_length(p_profile::text) > 20000 or exists (
    select 1 from jsonb_each(p_profile) as field(key, value)
    where field.key not in (
      'full_name', 'cpf', 'birth_date', 'phone', 'job_label',
      'bank', 'bank_branch', 'bank_account', 'pix_key'
    ) or jsonb_typeof(field.value) not in ('string', 'null')
  ) then
    raise exception 'Dados de perfil inválidos: use somente os campos pessoais permitidos.' using errcode = '22023';
  end if;

  if p_department_id is not null then
    perform 1 from comprova.departments d
    where d.id = p_department_id and d.company_id = p_company_id
    for key share;
    if not found then
      raise exception 'Departamento não encontrado nesta empresa.' using errcode = '22023';
    end if;
  end if;
  if p_job_title_id is not null then
    perform 1 from comprova.job_titles j
    where j.id = p_job_title_id and j.company_id = p_company_id and j.department_id = p_department_id
    for key share;
    if not found then
      raise exception 'O cargo não pertence ao departamento selecionado.' using errcode = '22023';
    end if;
  end if;

  -- Existing private helper keeps CPF/date normalization and column size limits.
  -- Any validation error rolls back both profile and classification atomically.
  perform comprova.write_company_member_profile(p_company_id, v_member, p_profile, false);
  update comprova.company_members
  set department_id = p_department_id, job_title_id = p_job_title_id
  where id = v_member and company_id = p_company_id and user_id = v_actor and active;
end;
$$;
revoke all on function comprova.update_my_company_member_profile(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function comprova.update_my_company_member_profile(uuid, uuid, uuid, jsonb) to authenticated;
