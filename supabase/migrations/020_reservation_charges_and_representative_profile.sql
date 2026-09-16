-- 当日確認する代表者属性と、予約ごとの料金明細

alter table public.reservations
  add column if not exists representative_age integer,
  add column if not exists representative_gender text;

alter table public.reservations
  drop constraint if exists reservations_representative_age_check;
alter table public.reservations
  add constraint reservations_representative_age_check
  check (representative_age is null or representative_age between 0 and 120);

comment on column public.reservations.representative_age is
  '代表者年齢（本予約フォーム外。当日確認・過去帳票から任意入力）';
comment on column public.reservations.representative_gender is
  '代表者性別（本予約フォーム外。当日確認・過去帳票から任意入力）';

create table if not exists public.reservation_charges (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  text not null references public.reservations(reservation_id) on delete cascade,
  category        text not null,
  label           text,
  unit_price      numeric(12, 2) not null default 0 check (unit_price >= 0),
  quantity        numeric(10, 2) not null default 1 check (quantity >= 0),
  subtotal        numeric(12, 2) not null default 0 check (subtotal >= 0),
  source          text not null default '手動',
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_reservation_charges_reservation
  on public.reservation_charges (reservation_id, sort_order, created_at);

comment on table public.reservation_charges is
  '宿泊・BBQ・追加炭・体育館・キャンセル等の予約料金明細';

alter table public.reservation_charges enable row level security;

drop policy if exists "staff_all_reservation_charges" on public.reservation_charges;
create policy "staff_all_reservation_charges" on public.reservation_charges
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on table public.reservation_charges
  to authenticated, service_role;

do $$
begin
  alter publication supabase_realtime add table public.reservation_charges;
exception
  when duplicate_object then null;
end $$;
