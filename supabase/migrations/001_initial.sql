-- みどりの時計台 予約管理（Supabase）初期スキーマ
-- hotel-reservation-gas の Config.js / 詳細仕様書を参考に設計

-- ---------------------------------------------------------------------------
-- マスタ
-- ---------------------------------------------------------------------------

create table if not exists public.rooms (
  room_id       text primary key,
  room_name     text not null,
  room_type     text,
  capacity      int,
  sort_order    int not null default 999,
  note          text,
  is_active     boolean not null default true,
  synced_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.master_values (
  id            uuid primary key default gen_random_uuid(),
  category      text not null,
  value         text not null,
  sort_order    int not null default 0,
  unique (category, value)
);

-- ID 連番（STUDIO-RQ / STUDIO-MT / MANUAL-MT）
create table if not exists public.import_sequences (
  key           text primary key,
  current_value int not null default 0,
  updated_at    timestamptz not null default now()
);

insert into public.import_sequences (key, current_value) values
  ('studio_rq', 0),
  ('studio_mt', 0),
  ('manual_mt', 0)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 予約台帳（03_予約台帳 / 07_アーカイブ）
-- ---------------------------------------------------------------------------

create table if not exists public.reservations (
  reservation_id          text primary key,
  access_key              text,
  import_source           text,
  import_row_id           text,
  request_id              text,
  channel                 text,
  status                  text not null default '確定',

  last_name               text,
  first_name              text,
  representative_name     text,
  last_name_kana          text,
  first_name_kana         text,
  name_kana               text,
  group_type              text,
  group_name              text,
  email                   text,
  phone                   text,
  phone_available         text,

  postal_code             text,
  prefecture              text,
  city                    text,
  address_line            text,
  address                 text,

  check_in                date,
  check_out               date,
  nights                  int,
  guest_total             text,
  adult_male              text,
  adult_female            text,
  boy_student             text,
  girl_student            text,
  age_3plus               text,
  under_3                 text,

  arrival_time            text,
  transport               text,
  vehicle_count           text,
  meal                    text,
  bbq                     text,
  inquiry                 text,

  travel_purpose          text,
  travel_purpose_other    text,
  referral                text,
  referral_other          text,
  last_stay               text,

  assignment_status       text default '未割当',
  companion_form_answered boolean not null default false,

  completion_email_sent     boolean not null default false,
  completion_email_sent_at  timestamptz,
  day11_email_sent          boolean not null default false,
  day11_email_sent_at       timestamptz,
  day3_email_sent           boolean not null default false,
  day3_email_sent_at        timestamptz,

  payment_method          text,
  payment_status          text default '未払い',
  customer_id             text,
  internal_memo           text,
  gcal_event_id           text,

  is_archived             boolean not null default false,
  sheet_created_at        timestamptz,
  sheet_updated_at        timestamptz,
  synced_at               timestamptz not null default now(),
  sheet_row               int,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_reservations_check_in
  on public.reservations (check_in);
create index if not exists idx_reservations_status
  on public.reservations (status) where not is_archived;
create index if not exists idx_reservations_access_key
  on public.reservations (access_key);

-- ---------------------------------------------------------------------------
-- リクエスト台帳（02 / 06）
-- ---------------------------------------------------------------------------

create table if not exists public.reservation_requests (
  request_id              text primary key,
  access_key              text,
  import_row_id           text,
  status                  text not null default 'リクエスト',

  last_name               text,
  first_name              text,
  representative_name     text,
  last_name_kana          text,
  first_name_kana         text,
  name_kana               text,
  group_type              text,
  email                   text,
  phone                   text,
  phone_available         text,

  check_in                date,
  check_out               date,
  nights                  int,
  guest_total             text,
  inquiry                 text,

  linked_reservation_id   text references public.reservations(reservation_id),
  reject_reason           text,
  internal_memo           text,

  reply_email_sent        boolean not null default false,
  reply_email_sent_at     timestamptz,

  is_archived             boolean not null default false,
  sheet_created_at        timestamptz,
  sheet_updated_at        timestamptz,
  synced_at               timestamptz not null default now(),

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_requests_status
  on public.reservation_requests (status) where not is_archived;

-- ---------------------------------------------------------------------------
-- 部屋割り（04 / 08）
-- ---------------------------------------------------------------------------

create table if not exists public.room_assignments (
  room_assignment_id      text primary key,
  reservation_id          text not null references public.reservations(reservation_id),
  room_id                 text references public.rooms(room_id),
  room_name               text,
  stay_start              date not null,
  stay_end                date not null,

  assigned_guest_count    int,
  male_count              int,
  female_count            int,
  child_count             int,
  boy_student_count       int,
  girl_student_count      int,
  age_3plus_count         int,
  under_3_count           int,

  display_memo            text,
  assignment_memo         text,

  is_archived             boolean not null default false,
  sheet_created_at        timestamptz,
  sheet_updated_at        timestamptz,
  synced_at               timestamptz not null default now(),

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_room_assignments_reservation
  on public.room_assignments (reservation_id);

-- ---------------------------------------------------------------------------
-- フォーム取込ログ（予約管理DBの P/Q・AM/AN 列の代替）
-- ---------------------------------------------------------------------------

create table if not exists public.form_import_log (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in ('studio', 'request')),
  source_row        int not null,
  reservation_id    text references public.reservations(reservation_id),
  request_id        text references public.reservation_requests(request_id),
  imported_at       timestamptz not null default now(),
  unique (source, source_row)
);

create table if not exists public.sync_runs (
  id              uuid primary key default gen_random_uuid(),
  job_name        text not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running',
  rows_read       int,
  rows_imported   int,
  rows_skipped    int,
  error_message   text,
  details         jsonb
);

-- ---------------------------------------------------------------------------
-- 初期部屋マスタ（11_部屋マスタ）
-- ---------------------------------------------------------------------------

insert into public.rooms (room_id, room_name, room_type, capacity, sort_order, note) values
  ('R01', '理科室', 'シングルベッド', 4, 1, 'シングルベッド4台'),
  ('R02', '低学年室', '畳・布団', 10, 2, '布団最大10枚程度'),
  ('R03', '高学年室', '畳・布団', 10, 3, '布団最大10枚程度'),
  ('R04', '保健室', '二段ベッド', 4, 4, '二段ベッド2台'),
  ('R05', '音楽室', '二段ベッド', 4, 5, '二段ベッド2台'),
  ('R06', '図書室', '二段ベッド', 6, 6, '予備・自社予約用')
on conflict (room_id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS（Phase 1: 開発用オープンポリシー。本番前に Auth 化）
-- ---------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.master_values enable row level security;
alter table public.import_sequences enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_requests enable row level security;
alter table public.room_assignments enable row level security;
alter table public.form_import_log enable row level security;
alter table public.sync_runs enable row level security;

drop policy if exists "dev_all_rooms" on public.rooms;
drop policy if exists "dev_all_master_values" on public.master_values;
drop policy if exists "dev_all_import_sequences" on public.import_sequences;
drop policy if exists "dev_all_reservations" on public.reservations;
drop policy if exists "dev_all_reservation_requests" on public.reservation_requests;
drop policy if exists "dev_all_room_assignments" on public.room_assignments;
drop policy if exists "dev_all_form_import_log" on public.form_import_log;
drop policy if exists "dev_all_sync_runs" on public.sync_runs;

create policy "dev_all_rooms" on public.rooms
  for all to anon, authenticated using (true) with check (true);
create policy "dev_all_master_values" on public.master_values
  for all to anon, authenticated using (true) with check (true);
create policy "dev_all_import_sequences" on public.import_sequences
  for all to anon, authenticated using (true) with check (true);
create policy "dev_all_reservations" on public.reservations
  for all to anon, authenticated using (true) with check (true);
create policy "dev_all_reservation_requests" on public.reservation_requests
  for all to anon, authenticated using (true) with check (true);
create policy "dev_all_room_assignments" on public.room_assignments
  for all to anon, authenticated using (true) with check (true);
create policy "dev_all_form_import_log" on public.form_import_log
  for all to anon, authenticated using (true) with check (true);
create policy "dev_all_sync_runs" on public.sync_runs
  for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- API ロールへの権限（Automatically expose new tables = OFF のとき必須）
-- 002_api_grants.sql と同一。001 だけ実行した場合も動くようにする。
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on table public.rooms to anon, authenticated, service_role;
grant select, insert, update, delete on table public.master_values to anon, authenticated, service_role;
grant select, insert, update, delete on table public.import_sequences to anon, authenticated, service_role;
grant select, insert, update, delete on table public.reservations to anon, authenticated, service_role;
grant select, insert, update, delete on table public.reservation_requests to anon, authenticated, service_role;
grant select, insert, update, delete on table public.room_assignments to anon, authenticated, service_role;
grant select, insert, update, delete on table public.form_import_log to anon, authenticated, service_role;
grant select, insert, update, delete on table public.sync_runs to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
