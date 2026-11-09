drop policy if exists comprova_sync_jobs_insert on comprova.sync_jobs;
create policy comprova_sync_jobs_insert on comprova.sync_jobs
for insert to authenticated
with check (
  exists (
    select 1
    from comprova.integration_connections c
    where c.id = sync_jobs.connection_id
      and c.owner_id = (select auth.uid())
  )
  and (
    sync_jobs.report_id is null
    or exists (
      select 1
      from comprova.reports r
      where r.id = sync_jobs.report_id
        and r.owner_id = (select auth.uid())
    )
  )
);
