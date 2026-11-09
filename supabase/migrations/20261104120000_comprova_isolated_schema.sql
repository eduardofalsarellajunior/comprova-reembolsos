-- COMPROVA isolated migration.
-- This migration intentionally does not modify public tables or auth.users.

create schema if not exists comprova;

create table if not exists comprova.user_map (
  source_user_id uuid primary key,
  source_email text not null,
  destination_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (destination_user_id)
);

create table if not exists comprova.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  file_name text not null,
  storage_path text not null,
  storage_bucket text not null default 'comprova-documents',
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comprova_receipts_storage_path_key unique (storage_path)
);

create table if not exists comprova.expenses (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references comprova.receipts(id),
  user_id uuid not null references auth.users(id),
  supplier text not null default '',
  expense_date date,
  amount numeric,
  currency text not null default 'BRL',
  category text not null default 'Outros',
  description text not null default '',
  confidence text not null default 'baixa',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  vexpenses_expense_id bigint,
  vexpenses_report_id bigint,
  vexpenses_status text not null default 'not_sent',
  vexpenses_error text,
  vexpenses_sent_at timestamptz
);

create index if not exists comprova_receipts_user_created_idx
  on comprova.receipts (user_id, created_at desc);
create index if not exists comprova_expenses_receipt_idx
  on comprova.expenses (receipt_id);
create index if not exists comprova_expenses_user_created_idx
  on comprova.expenses (user_id, created_at desc);
create index if not exists comprova_expenses_user_vexpenses_status_idx
  on comprova.expenses (user_id, vexpenses_status);

alter table comprova.user_map enable row level security;
alter table comprova.receipts enable row level security;
alter table comprova.expenses enable row level security;

drop policy if exists comprova_user_map_select_own on comprova.user_map;
create policy comprova_user_map_select_own
  on comprova.user_map for select to authenticated
  using ((select auth.uid()) = destination_user_id);

drop policy if exists comprova_receipts_select_own on comprova.receipts;
create policy comprova_receipts_select_own
  on comprova.receipts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists comprova_receipts_insert_own on comprova.receipts;
create policy comprova_receipts_insert_own
  on comprova.receipts for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists comprova_receipts_update_own on comprova.receipts;
create policy comprova_receipts_update_own
  on comprova.receipts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists comprova_receipts_delete_own on comprova.receipts;
create policy comprova_receipts_delete_own
  on comprova.receipts for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists comprova_expenses_select_own on comprova.expenses;
create policy comprova_expenses_select_own
  on comprova.expenses for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists comprova_expenses_insert_own on comprova.expenses;
create policy comprova_expenses_insert_own
  on comprova.expenses for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from comprova.receipts r
      where r.id = receipt_id and r.user_id = (select auth.uid())
    )
  );

drop policy if exists comprova_expenses_update_own on comprova.expenses;
create policy comprova_expenses_update_own
  on comprova.expenses for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from comprova.receipts r
      where r.id = receipt_id and r.user_id = (select auth.uid())
    )
  );

drop policy if exists comprova_expenses_delete_own on comprova.expenses;
create policy comprova_expenses_delete_own
  on comprova.expenses for delete to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema comprova to authenticated;
grant select, insert, update, delete on comprova.receipts to authenticated;
grant select, insert, update, delete on comprova.expenses to authenticated;

-- Buckets are private and namespaced. ON CONFLICT protects existing objects.
insert into storage.buckets (id, name, public)
values
  ('comprova-uploads', 'comprova-uploads', false),
  ('comprova-documents', 'comprova-documents', false),
  ('comprova-recordings', 'comprova-recordings', false)
on conflict (id) do nothing;

drop policy if exists comprova_storage_select on storage.objects;
create policy comprova_storage_select
  on storage.objects for select to authenticated
  using (
    bucket_id in ('comprova-uploads', 'comprova-documents', 'comprova-recordings')
    and exists (
      select 1 from comprova.user_map m
      where m.destination_user_id = (select auth.uid())
        and split_part(name, '/', 1) = m.source_user_id::text
    )
  );

drop policy if exists comprova_storage_insert on storage.objects;
create policy comprova_storage_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('comprova-uploads', 'comprova-documents', 'comprova-recordings')
    and exists (
      select 1 from comprova.user_map m
      where m.destination_user_id = (select auth.uid())
        and split_part(name, '/', 1) = m.source_user_id::text
    )
  );

drop policy if exists comprova_storage_update on storage.objects;
create policy comprova_storage_update
  on storage.objects for update to authenticated
  using (
    bucket_id in ('comprova-uploads', 'comprova-documents', 'comprova-recordings')
    and exists (
      select 1 from comprova.user_map m
      where m.destination_user_id = (select auth.uid())
        and split_part(name, '/', 1) = m.source_user_id::text
    )
  )
  with check (
    bucket_id in ('comprova-uploads', 'comprova-documents', 'comprova-recordings')
    and exists (
      select 1 from comprova.user_map m
      where m.destination_user_id = (select auth.uid())
        and split_part(name, '/', 1) = m.source_user_id::text
    )
  );

drop policy if exists comprova_storage_delete on storage.objects;
create policy comprova_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('comprova-uploads', 'comprova-documents', 'comprova-recordings')
    and exists (
      select 1 from comprova.user_map m
      where m.destination_user_id = (select auth.uid())
        and split_part(name, '/', 1) = m.source_user_id::text
    )
  );
