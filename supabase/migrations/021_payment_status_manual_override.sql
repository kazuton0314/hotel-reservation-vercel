-- 料金明細による自動判定と、スタッフの手動上書きを区別する

alter table public.reservations
  add column if not exists payment_status_manual_override boolean not null default false;

comment on column public.reservations.payment_status_manual_override is
  'true の間は料金明細・人数変更による支払状況の自動更新を行わない';
