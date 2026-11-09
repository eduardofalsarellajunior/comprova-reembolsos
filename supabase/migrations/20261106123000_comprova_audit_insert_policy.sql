drop policy if exists comprova_audit_events_insert on comprova.audit_events;
create policy comprova_audit_events_insert on comprova.audit_events for insert to authenticated
with check ((select auth.uid()) = actor_user_id);

drop policy if exists comprova_sync_jobs_insert on comprova.sync_jobs;
create policy comprova_sync_jobs_insert on comprova.sync_jobs for insert to authenticated
with check (exists (select 1 from comprova.integration_connections c where c.id = sync_jobs.connection_id and c.owner_id = (select auth.uid())));
