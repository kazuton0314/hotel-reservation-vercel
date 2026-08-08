-- 宿泊者メモ: 当日知りえた宿泊者情報（運用メモとは別）
alter table public.reservations
  add column if not exists guest_memo text;

comment on column public.reservations.internal_memo is '運用メモ（特別な事情・配慮が必要なケース）';
comment on column public.reservations.guest_memo is '宿泊者メモ（当日知りえた情報）';
