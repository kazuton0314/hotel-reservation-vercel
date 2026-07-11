-- Phase 4: Auth — authenticated staff only (service_role bypasses RLS)
-- 再実行しても失敗しにくいよう IF EXISTS を付与

-- Drop development open policies
drop policy if exists "dev_all_rooms" on public.rooms;
drop policy if exists "dev_all_master_values" on public.master_values;
drop policy if exists "dev_all_import_sequences" on public.import_sequences;
drop policy if exists "dev_all_reservations" on public.reservations;
drop policy if exists "dev_all_reservation_requests" on public.reservation_requests;
drop policy if exists "dev_all_room_assignments" on public.room_assignments;
drop policy if exists "dev_all_form_import_log" on public.form_import_log;
drop policy if exists "dev_all_sync_runs" on public.sync_runs;
drop policy if exists "dev_all_companions" on public.companions;

-- Drop staff policies (再実行対策)
drop policy if exists "staff_all_rooms" on public.rooms;
drop policy if exists "staff_all_master_values" on public.master_values;
drop policy if exists "staff_all_import_sequences" on public.import_sequences;
drop policy if exists "staff_all_reservations" on public.reservations;
drop policy if exists "staff_all_reservation_requests" on public.reservation_requests;
drop policy if exists "staff_all_room_assignments" on public.room_assignments;
drop policy if exists "staff_all_form_import_log" on public.form_import_log;
drop policy if exists "staff_all_sync_runs" on public.sync_runs;
drop policy if exists "staff_all_companions" on public.companions;

-- Authenticated staff policies
create policy "staff_all_rooms" on public.rooms
  for all to authenticated using (true) with check (true);
create policy "staff_all_master_values" on public.master_values
  for all to authenticated using (true) with check (true);
create policy "staff_all_import_sequences" on public.import_sequences
  for all to authenticated using (true) with check (true);
create policy "staff_all_reservations" on public.reservations
  for all to authenticated using (true) with check (true);
create policy "staff_all_reservation_requests" on public.reservation_requests
  for all to authenticated using (true) with check (true);
create policy "staff_all_room_assignments" on public.room_assignments
  for all to authenticated using (true) with check (true);
create policy "staff_all_form_import_log" on public.form_import_log
  for all to authenticated using (true) with check (true);
create policy "staff_all_sync_runs" on public.sync_runs
  for all to authenticated using (true) with check (true);
create policy "staff_all_companions" on public.companions
  for all to authenticated using (true) with check (true);

-- Remove anonymous DML (defense in depth; cron/scripts use service_role)
revoke all on table public.rooms from anon;
revoke all on table public.master_values from anon;
revoke all on table public.import_sequences from anon;
revoke all on table public.reservations from anon;
revoke all on table public.reservation_requests from anon;
revoke all on table public.room_assignments from anon;
revoke all on table public.form_import_log from anon;
revoke all on table public.sync_runs from anon;
revoke all on table public.companions from anon;

grant select, insert, update, delete on table public.rooms to authenticated, service_role;
grant select, insert, update, delete on table public.master_values to authenticated, service_role;
grant select, insert, update, delete on table public.import_sequences to authenticated, service_role;
grant select, insert, update, delete on table public.reservations to authenticated, service_role;
grant select, insert, update, delete on table public.reservation_requests to authenticated, service_role;
grant select, insert, update, delete on table public.room_assignments to authenticated, service_role;
grant select, insert, update, delete on table public.form_import_log to authenticated, service_role;
grant select, insert, update, delete on table public.sync_runs to authenticated, service_role;
grant select, insert, update, delete on table public.companions to authenticated, service_role;
