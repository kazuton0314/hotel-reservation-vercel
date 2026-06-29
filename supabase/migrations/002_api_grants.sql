-- Supabase で「Automatically expose new tables」を OFF にした場合に必要
-- Data API ロール（anon / authenticated / service_role）へテーブル権限を付与

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on table public.rooms to anon, authenticated, service_role;
grant select, insert, update, delete on table public.master_values to anon, authenticated, service_role;
grant select, insert, update, delete on table public.import_sequences to anon, authenticated, service_role;
grant select, insert, update, delete on table public.reservations to anon, authenticated, service_role;
grant select, insert, update, delete on table public.reservation_requests to anon, authenticated, service_role;
grant select, insert, update, delete on table public.room_assignments to anon, authenticated, service_role;
grant select, insert, update, delete on table public.form_import_log to anon, authenticated, service_role;
grant select, insert, update, delete on table public.sync_runs to anon, authenticated, service_role;

-- 将来テーブルを SQL で追加したときも自動付与（public スキーマ）
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
