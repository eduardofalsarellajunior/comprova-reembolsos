alter table public.expenses
  add column if not exists vexpenses_expense_id bigint,
  add column if not exists vexpenses_report_id bigint,
  add column if not exists vexpenses_status text not null default 'not_sent',
  add column if not exists vexpenses_error text,
  add column if not exists vexpenses_sent_at timestamptz;

alter table public.expenses
  drop constraint if exists expenses_vexpenses_status_check;

alter table public.expenses
  add constraint expenses_vexpenses_status_check
  check (vexpenses_status in ('not_sent', 'sending', 'sent', 'error'));

create index if not exists expenses_user_vexpenses_status_idx
  on public.expenses (user_id, vexpenses_status);
