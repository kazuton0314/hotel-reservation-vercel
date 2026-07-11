-- Resend delivery status tracking
alter table mail_logs
  add column if not exists provider_status text,
  add column if not exists provider_status_at timestamptz;

create index if not exists mail_logs_provider_id_idx
  on mail_logs (provider_id)
  where provider_id is not null;
