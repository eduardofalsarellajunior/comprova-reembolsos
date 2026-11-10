-- Preserve all existing shared-project API schemas and append only COMPROVA.
-- Do not reset the authenticator override: other applications rely on it.
do $$
declare
  current_schemas text;
begin
  select substr(setting, length('pgrst.db_schemas=') + 1)
    into current_schemas
  from pg_roles r
  cross join lateral unnest(r.rolconfig) as setting
  where r.rolname = 'authenticator'
    and setting like 'pgrst.db_schemas=%';

  if current_schemas = 'public, graphql_public, fechamentotri, consorcio_analytics' then
    execute 'alter role authenticator set pgrst.db_schemas = '
      || quote_literal('public, graphql_public, fechamentotri, consorcio_analytics, comprova');
  elsif current_schemas = 'public, graphql_public, fechamentotri, consorcio_analytics, comprova' then
    null; -- Safe to rerun.
  else
    raise exception 'Unexpected authenticator schema override: %', current_schemas;
  end if;
end $$;

notify pgrst, 'reload config';
