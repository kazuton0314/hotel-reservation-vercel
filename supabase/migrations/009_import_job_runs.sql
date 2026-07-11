create table if not exists public.import_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  source text not null default 'script',
  target text,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  details jsonb
);

create index if not exists idx_import_job_runs_started_at
  on public.import_job_runs (started_at desc);

alter table public.import_job_runs enable row level security;

create policy "dev_all_import_job_runs" on public.import_job_runs
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on table public.import_job_runs
  to anon, authenticated, service_role;
