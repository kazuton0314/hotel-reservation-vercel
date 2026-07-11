-- Outbound mail logs (Resend / SMTP)

create table if not exists public.mail_logs (
  mail_log_id      uuid primary key default gen_random_uuid(),
  entity_type      text not null,
  entity_id        text not null,
  to_email         text not null,
  subject          text not null,
  body_preview     text not null default '',
  template_id      text,
  provider         text not null default 'resend',
  provider_id      text,
  status           text not null default 'sent',
  error_message    text,
  sent_by          uuid references auth.users(id),
  created_at       timestamptz not null default now()
);

create index if not exists idx_mail_logs_entity
  on public.mail_logs (entity_type, entity_id, created_at desc);

create index if not exists idx_mail_logs_created
  on public.mail_logs (created_at desc);

alter table public.mail_logs enable row level security;

create policy "staff_all_mail_logs" on public.mail_logs
  for all to authenticated using (true) with check (true);

grant select, insert on table public.mail_logs
  to authenticated, service_role;
