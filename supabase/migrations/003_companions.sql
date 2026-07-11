-- 同行者情報（05_同行者情報）+ 部屋割りID連番

create table if not exists public.companions (
  id              uuid primary key default gen_random_uuid(),
  access_key      text,
  reservation_id  text not null references public.reservations(reservation_id) on delete cascade,
  answered_at     timestamptz not null default now(),
  entry_no        int not null,
  name            text not null,
  name_kana       text,
  age             text,
  gender          text,
  source          text not null default '手動',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (reservation_id, entry_no)
);

create index if not exists idx_companions_reservation
  on public.companions (reservation_id);

alter table public.companions enable row level security;

create policy "dev_all_companions" on public.companions
  for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on table public.companions
  to anon, authenticated, service_role;
