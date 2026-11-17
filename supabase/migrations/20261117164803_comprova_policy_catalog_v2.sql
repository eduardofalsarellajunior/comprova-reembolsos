-- INEPAD catalog and company-scoped expense/mileage settings.
-- Keep legacy policy_rules and catalog identifiers used by past reports.
alter table comprova.payment_methods add column exclusive_per_report boolean not null default false;
create unique index if not exists comprova_members_company_row_v2_idx on comprova.company_members(company_id,id);
create unique index if not exists comprova_categories_company_row_v2_idx on comprova.expense_categories(company_id,id);
create unique index if not exists comprova_mileage_company_row_v2_idx on comprova.mileage_policies(company_id,id);

create table comprova.expense_policy_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references comprova.companies(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  is_default boolean not null default false,
  past_days integer check (past_days between 0 and 36500),
  future_days integer check (future_days between 0 and 36500),
  unique (company_id,id)
);
create unique index comprova_expense_policy_name_v2_idx on comprova.expense_policy_configs(company_id,lower(name));
create unique index comprova_expense_policy_default_v2_idx on comprova.expense_policy_configs(company_id) where is_default;

create table comprova.expense_policy_limits (
  company_id uuid not null,
  policy_id uuid not null,
  category_id uuid not null,
  max_amount numeric(14,2) check (max_amount > 0 and max_amount <> 'NaN'::numeric),
  amount_period text not null default 'expense' check (amount_period in ('expense','day','week','month','report')),
  max_entries integer check (max_entries between 1 and 100000),
  count_period text not null default 'day' check (count_period in ('day','week','month','report')),
  allow_exceed boolean not null default false,
  primary key (policy_id,category_id),
  foreign key (company_id,policy_id) references comprova.expense_policy_configs(company_id,id) on delete cascade,
  foreign key (company_id,category_id) references comprova.expense_categories(company_id,id) on delete restrict
);
create index comprova_expense_policy_limits_category_v2_idx on comprova.expense_policy_limits(company_id,category_id);

create table comprova.expense_policy_members (
  company_id uuid not null,
  policy_id uuid not null,
  member_id uuid not null,
  primary key (company_id,member_id),
  foreign key (company_id,policy_id) references comprova.expense_policy_configs(company_id,id) on delete cascade,
  foreign key (company_id,member_id) references comprova.company_members(company_id,id) on delete cascade
);
create index comprova_expense_policy_members_policy_v2_idx on comprova.expense_policy_members(company_id,policy_id);

alter table comprova.mileage_policies
  alter column rate_per_km drop not null,
  add column is_default boolean not null default false,
  add column allow_manual_rate boolean,
  add column requires_manual_receipt boolean,
  add column vehicle_rates jsonb not null default '{}'::jsonb,
  add constraint comprova_mileage_default_values_v2_chk check (
    not is_default or (active and rate_per_km is not null and allow_manual_rate is not null and requires_manual_receipt is not null)
  );

create function comprova.valid_mileage_vehicle_rates(p_rates jsonb)
returns boolean language sql immutable set search_path='' as $body$
  select case when jsonb_typeof(p_rates) <> 'object' then false else not exists (
    select 1 from jsonb_each(p_rates) pairs(name, rate)
    where name not in ('car','motorcycle','truck','pickup','bus','van','other')
      or case when jsonb_typeof(rate) <> 'number' then true else
        (rate #>> '{}')::numeric <= 0 or (rate #>> '{}')::numeric >= 100000000 or scale((rate #>> '{}')::numeric) > 4 end
  ) end;
$body$;
revoke all on function comprova.valid_mileage_vehicle_rates(jsonb) from public, anon;
grant execute on function comprova.valid_mileage_vehicle_rates(jsonb) to authenticated;
alter table comprova.mileage_policies add constraint comprova_mileage_vehicle_rates_v2_chk
  check (comprova.valid_mileage_vehicle_rates(vehicle_rates));
create unique index comprova_mileage_default_v2_idx on comprova.mileage_policies(company_id) where is_default;

create table comprova.mileage_policy_members (
  company_id uuid not null,
  policy_id uuid not null,
  member_id uuid not null,
  primary key (company_id,member_id),
  foreign key (company_id,policy_id) references comprova.mileage_policies(company_id,id) on delete cascade,
  foreign key (company_id,member_id) references comprova.company_members(company_id,id) on delete cascade
);
create index comprova_mileage_members_policy_v2_idx on comprova.mileage_policy_members(company_id,policy_id);

create table comprova.mileage_routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references comprova.companies(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  origin text not null check (char_length(btrim(origin)) between 2 and 160),
  destination text not null check (char_length(btrim(destination)) between 2 and 160),
  kilometers numeric(12,2) not null check (kilometers > 0 and kilometers <> 'NaN'::numeric),
  active boolean not null default true,
  unique (company_id,title)
);

alter table comprova.expense_policy_configs enable row level security;
alter table comprova.expense_policy_limits enable row level security;
alter table comprova.expense_policy_members enable row level security;
alter table comprova.mileage_policy_members enable row level security;
alter table comprova.mileage_routes enable row level security;

create policy comprova_expense_configs_read_v2 on comprova.expense_policy_configs for select to authenticated using (
  comprova.is_company_admin(company_id) or (comprova.is_company_member(company_id) and (
    is_default or exists(select 1 from comprova.expense_policy_members link where link.policy_id=expense_policy_configs.id)
  ))
);
create policy comprova_expense_configs_manage_v2 on comprova.expense_policy_configs for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));
create policy comprova_expense_limits_read_v2 on comprova.expense_policy_limits for select to authenticated
  using (exists(select 1 from comprova.expense_policy_configs config where config.id=expense_policy_limits.policy_id));
create policy comprova_expense_limits_manage_v2 on comprova.expense_policy_limits for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));
create policy comprova_expense_members_read_v2 on comprova.expense_policy_members for select to authenticated using (
  comprova.is_company_admin(company_id) or exists (
    select 1 from comprova.company_members m where m.id=expense_policy_members.member_id and m.active and m.user_id=(select auth.uid())
  )
);
create policy comprova_expense_members_manage_v2 on comprova.expense_policy_members for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));
create policy comprova_mileage_members_read_v2 on comprova.mileage_policy_members for select to authenticated using (
  comprova.is_company_admin(company_id) or exists (
    select 1 from comprova.company_members m where m.id=mileage_policy_members.member_id and m.active and m.user_id=(select auth.uid())
  )
);
create policy comprova_mileage_members_manage_v2 on comprova.mileage_policy_members for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));
-- Replace the legacy company-wide read rule: specific policies belong to linked members.
drop policy comprova_mileage_policies_read on comprova.mileage_policies;
create policy comprova_mileage_policies_read_v2 on comprova.mileage_policies for select to authenticated using (
  comprova.is_company_admin(company_id) or (active and comprova.is_company_member(company_id) and (
    is_default or exists(select 1 from comprova.mileage_policy_members link where link.policy_id=mileage_policies.id)
  ))
);
create policy comprova_mileage_routes_read_v2 on comprova.mileage_routes for select to authenticated
  using (comprova.is_company_member(company_id));
create policy comprova_mileage_routes_manage_v2 on comprova.mileage_routes for all to authenticated
  using (comprova.is_company_admin(company_id)) with check (comprova.is_company_admin(company_id));

revoke all on table comprova.expense_policy_configs,comprova.expense_policy_limits,comprova.expense_policy_members,
  comprova.mileage_policy_members,comprova.mileage_routes from public,anon,authenticated;
grant select,delete on table comprova.expense_policy_configs,comprova.expense_policy_limits,comprova.expense_policy_members,
  comprova.mileage_policy_members,comprova.mileage_routes to authenticated;
grant insert(company_id,name,is_default,past_days,future_days),update(name,past_days,future_days) on comprova.expense_policy_configs to authenticated;
grant insert(company_id,policy_id,category_id,max_amount,amount_period,max_entries,count_period,allow_exceed),
  update(max_amount,amount_period,max_entries,count_period,allow_exceed) on comprova.expense_policy_limits to authenticated;
grant insert(company_id,policy_id,member_id) on comprova.expense_policy_members,comprova.mileage_policy_members to authenticated;
grant insert(company_id,title,origin,destination,kilometers,active),update(title,origin,destination,kilometers,active)
  on comprova.mileage_routes to authenticated;
grant insert(is_default,allow_manual_rate,requires_manual_receipt,vehicle_rates),
  update(allow_manual_rate,requires_manual_receipt,vehicle_rates) on comprova.mileage_policies to authenticated;

-- An atomic update prevents a partially saved form/membership list.
create function comprova.save_expense_policy_config(
  p_company_id uuid,p_policy_id uuid,p_name text,p_default boolean,p_past_days integer,p_future_days integer,
  p_limits jsonb,p_member_ids uuid[]
) returns uuid language plpgsql set search_path='' as $body$
declare v_policy uuid; v_default boolean;
begin
  if (select auth.uid()) is null or not comprova.is_company_admin(p_company_id) then raise exception 'Permissão insuficiente.' using errcode='42501'; end if;
  -- Serialize membership changes, including competing assignments to a specific policy.
  perform 1 from comprova.companies where id=p_company_id for update;
  if p_default is null or coalesce(cardinality(p_member_ids),0)>1000 then
    raise exception 'Política ou membros inválidos.' using errcode='22023'; end if;
  if jsonb_typeof(p_limits) is distinct from 'array' or jsonb_array_length(p_limits)>250 then
    raise exception 'Limites inválidos.' using errcode='22023'; end if;
  if p_policy_id is null then
    insert into comprova.expense_policy_configs(company_id,name,is_default,past_days,future_days)
      values (p_company_id,btrim(p_name),p_default,p_past_days,p_future_days) returning id,is_default into v_policy,v_default;
  else
    update comprova.expense_policy_configs set name=btrim(p_name),past_days=p_past_days,future_days=p_future_days
      where id=p_policy_id and company_id=p_company_id returning id,is_default into v_policy,v_default;
    if not found then raise exception 'Política não encontrada.' using errcode='22023'; end if;
  end if;
  if (select count(*) from comprova.company_members m where m.company_id=p_company_id and m.id=any(p_member_ids)
    and (m.active or exists(select 1 from comprova.expense_policy_members link where link.policy_id=v_policy and link.member_id=m.id)))
    <> coalesce(cardinality(p_member_ids),0) then
    raise exception 'Selecione membros ativos e sem duplicidade.' using errcode='22023'; end if;
  if v_default and coalesce(cardinality(p_member_ids),0)>0 then raise exception 'A política padrão não exige vínculo manual.'; end if;
  delete from comprova.expense_policy_limits where policy_id=v_policy and company_id=p_company_id;
  insert into comprova.expense_policy_limits(company_id,policy_id,category_id,max_amount,amount_period,max_entries,count_period,allow_exceed)
  select p_company_id,v_policy,item.category_id,item.max_amount,item.amount_period,item.max_entries,item.count_period,item.allow_exceed
  from jsonb_to_recordset(p_limits) as item(category_id uuid,max_amount numeric,amount_period text,max_entries integer,count_period text,allow_exceed boolean);
  delete from comprova.expense_policy_members where policy_id=v_policy and company_id=p_company_id;
  insert into comprova.expense_policy_members(company_id,policy_id,member_id)
    select p_company_id,v_policy,m from unnest(p_member_ids) m
    on conflict(company_id,member_id) do nothing;
  if coalesce(cardinality(p_member_ids),0) <> (select count(*) from comprova.expense_policy_members where policy_id=v_policy) then
    raise exception 'Um membro já tem outra política específica de despesas.' using errcode='23505';
  end if;
  return v_policy;
end;
$body$;
revoke all on function comprova.save_expense_policy_config(uuid,uuid,text,boolean,integer,integer,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function comprova.save_expense_policy_config(uuid,uuid,text,boolean,integer,integer,jsonb,uuid[]) to authenticated;

create function comprova.save_mileage_policy_config(
  p_company_id uuid,p_policy_id uuid,p_name text,p_default boolean,p_rate numeric,p_vehicle_rates jsonb,
  p_allow_manual boolean,p_requires_receipt boolean,p_member_ids uuid[]
) returns uuid language plpgsql set search_path='' as $body$
declare v_policy uuid; v_default boolean;
begin
  if (select auth.uid()) is null or not comprova.is_company_admin(p_company_id) then raise exception 'Permissão insuficiente.' using errcode='42501'; end if;
  perform 1 from comprova.companies where id=p_company_id for update;
  if p_default is null or coalesce(cardinality(p_member_ids),0)>1000 then
    raise exception 'Política ou membros inválidos.' using errcode='22023'; end if;
  if p_policy_id is null then
    insert into comprova.mileage_policies(company_id,name,is_default,rate_per_km,vehicle_rates,allow_manual_rate,requires_manual_receipt)
      values (p_company_id,btrim(p_name),p_default,p_rate,p_vehicle_rates,p_allow_manual,p_requires_receipt)
      returning id,is_default into v_policy,v_default;
  else
    update comprova.mileage_policies set name=btrim(p_name),rate_per_km=p_rate,vehicle_rates=p_vehicle_rates,
      allow_manual_rate=p_allow_manual,requires_manual_receipt=p_requires_receipt
      where id=p_policy_id and company_id=p_company_id returning id,is_default into v_policy,v_default;
    if not found then raise exception 'Política não encontrada.' using errcode='22023'; end if;
  end if;
  if (select count(*) from comprova.company_members m where m.company_id=p_company_id and m.id=any(p_member_ids)
    and (m.active or exists(select 1 from comprova.mileage_policy_members link where link.policy_id=v_policy and link.member_id=m.id)))
    <> coalesce(cardinality(p_member_ids),0) then
    raise exception 'Selecione membros ativos e sem duplicidade.' using errcode='22023'; end if;
  if v_default and coalesce(cardinality(p_member_ids),0)>0 then raise exception 'A política padrão não exige vínculo manual.'; end if;
  delete from comprova.mileage_policy_members where policy_id=v_policy and company_id=p_company_id;
  insert into comprova.mileage_policy_members(company_id,policy_id,member_id)
    select p_company_id,v_policy,m from unnest(p_member_ids) m
    on conflict(company_id,member_id) do nothing;
  if coalesce(cardinality(p_member_ids),0) <> (select count(*) from comprova.mileage_policy_members where policy_id=v_policy) then
    raise exception 'Um membro já tem outra política específica de quilometragem.' using errcode='23505';
  end if;
  return v_policy;
end;
$body$;
revoke all on function comprova.save_mileage_policy_config(uuid,uuid,text,boolean,numeric,jsonb,boolean,boolean,uuid[]) from public,anon,authenticated;
grant execute on function comprova.save_mileage_policy_config(uuid,uuid,text,boolean,numeric,jsonb,boolean,boolean,uuid[]) to authenticated;

-- Validate only newly submitted report revisions; historical records are not rewritten.
create function comprova.enforce_expense_policy_on_submit()
returns trigger language plpgsql security definer set search_path='' as $body$
declare v_member uuid; v_policy comprova.expense_policy_configs%rowtype; v_limit record;
  v_date date := (now() at time zone 'America/Sao_Paulo')::date; v_bad boolean;
begin
  if old.status not in ('draft','rejected') or new.status <> 'submitted' then return new; end if;
  -- Serialize checks per member so two concurrent drafts cannot spend the same allowance.
  select m.id into v_member from comprova.company_members m
    where m.company_id=new.company_id and m.user_id=new.owner_id and m.active for update;
  if not found then raise exception 'Membro sem vínculo ativo na empresa.' using errcode='23514'; end if;
  if exists (
    select 1 from comprova.report_expenses re join comprova.expenses e on re.expense_id=e.id
    where re.report_id=new.id and not exists (
      select 1 from comprova.expense_categories c where c.company_id=new.company_id and c.active and c.name=e.category
    )
  ) then raise exception 'Selecione um tipo de despesa ativo desta empresa para todos os lançamentos.' using errcode='23514'; end if;
  select config.* into v_policy
  from comprova.expense_policy_configs config
  where config.company_id=new.company_id and (config.is_default or exists (
    select 1 from comprova.expense_policy_members link where link.policy_id=config.id and link.member_id=v_member
  ))
  order by config.is_default asc limit 1;
  if not found then return new; end if;
  if exists (
    select 1 from comprova.report_expenses re join comprova.expenses e on re.expense_id=e.id where re.report_id=new.id and
      ((v_policy.past_days is not null and v_date - e.expense_date > v_policy.past_days) or
       (v_policy.future_days is not null and e.expense_date-v_date > v_policy.future_days))
  ) then raise exception 'Uma despesa está fora do prazo permitido pela política.' using errcode='23514'; end if;

  for v_limit in
    select l.*,c.name from comprova.expense_policy_limits l join comprova.expense_categories c on c.id=l.category_id
      where l.policy_id=v_policy.id and not l.allow_exceed and (l.max_amount is not null or l.max_entries is not null)
  loop
    with current_expenses as (
      select e.expense_date, e.amount from comprova.report_expenses re join comprova.expenses e on e.id=re.expense_id
      where re.report_id=new.id and e.category=v_limit.name
    ), window_expenses as (
      select expense_date,amount,true as current_report from current_expenses
      union all
      select e.expense_date,e.amount,false from comprova.reports r
      join comprova.report_expenses re on re.report_id=r.id join comprova.expenses e on e.id=re.expense_id
      where r.company_id=new.company_id and r.owner_id=new.owner_id and r.id<>new.id
      and r.status in ('submitted','in_review','approved','paid') and r.currency='BRL' and e.currency='BRL'
      and e.category=v_limit.name and exists (select 1 from current_expenses)
    )
    select
      (v_limit.max_amount is not null and case v_limit.amount_period
        when 'expense' then exists(select 1 from current_expenses where amount>v_limit.max_amount)
        when 'report' then coalesce((select sum(amount) from current_expenses),0)>v_limit.max_amount
        else exists(select 1 from window_expenses group by date_trunc(v_limit.amount_period,expense_date::timestamp)
          having bool_or(current_report) and sum(amount)>v_limit.max_amount)
      end)
      or (v_limit.max_entries is not null and case v_limit.count_period
        when 'report' then (select count(*) from current_expenses)>v_limit.max_entries
        else exists(select 1 from window_expenses group by date_trunc(v_limit.count_period,expense_date::timestamp)
          having bool_or(current_report) and count(*)>v_limit.max_entries)
      end)
    into v_bad;
    if v_bad then raise exception 'A política excede o limite de valor ou lançamentos para %.',v_limit.name using errcode='23514'; end if;
  end loop;
  return new;
end;
$body$;
revoke all on function comprova.enforce_expense_policy_on_submit() from public,anon,authenticated;
create trigger comprova_expense_policy_submit_v2 before update of status on comprova.reports
  for each row execute function comprova.enforce_expense_policy_on_submit();

-- Seed screenshots only if there is precisely one company matching the known INEPAD names.
-- Existing catalog values, IDs, active flags, and lookups are never overwritten.
do $body$
declare v_ids uuid[]; v_company uuid;
begin
  select array_agg(c.id) into v_ids from comprova.companies c
  where comprova.is_inepad_catalog_name(c.name) or comprova.is_inepad_catalog_name(c.legal_name);
  if coalesce(cardinality(v_ids),0) <> 1 then return; end if;
  v_company:=v_ids[1];

  insert into comprova.payment_methods(company_id,name,reimbursable,exclusive_per_report)
  select v_company,s.name,s.reimbursable,false from (values ('Dinheiro',true),('Cartão Pessoal',true),('Cartão Corporativo',false)) s(name,reimbursable)
  where not exists(select 1 from comprova.payment_methods p where p.company_id=v_company and lower(p.name)=lower(s.name))
  on conflict(company_id,name) do nothing;

  insert into comprova.expense_categories(company_id,name)
  select v_company,s.name from (values ('Alimentação'),('Combustível'),('Estacionamento'),('Gráfica'),('Hospedagem'),
    ('Locação Automóvel'),('Outros'),('Passagem Aérea'),('Passagem Rodoviária'),('Pedágio'),('Taxi'),('Telefonia')) s(name)
  where not exists(select 1 from comprova.expense_categories c where c.company_id=v_company and lower(c.name)=lower(s.name))
  on conflict(company_id,name) do nothing;

  insert into comprova.expense_policy_configs(company_id,name,is_default) values (v_company,'INEPAD',true)
  on conflict do nothing;

  insert into comprova.mileage_policies(company_id,name,is_default,rate_per_km,allow_manual_rate,requires_manual_receipt)
  values (v_company,'Política Padrão da Empresa',true,1.5000,true,false)
  on conflict do nothing;

  -- No specific rates or links were provided: inherit the general policy.
  insert into comprova.mileage_policies(company_id,name,rate_per_km)
  values (v_company,'Comercial/Serviços Internos',null),(v_company,'Operações (Projetos)',null),
    (v_company,'Política com possibilidade de alteração de valor km manual',null)
  on conflict do nothing;

  insert into comprova.mileage_routes(company_id,title,origin,destination,kilometers)
  select v_company,'Ida/Volta: Ribeirão Preto - ' || s.destination,'Ribeirão Preto',s.destination,s.km
  from (values ('Marília',552.00),('Itu',532.00),('Olímpia',280.00),('Franca',202.00),('Indaiatuba',484.00),
    ('Cravinhos',42.00),('Cajuru',130.00),('Mococa',218.00),('Guaxupé',316.00),('Sertãozinho',55.00)) s(destination,km)
  on conflict do nothing;
end;
$body$;
