-- Range query indexes for overlap / calendar / conflict checks

create index if not exists idx_reservations_active_interval
  on public.reservations (check_in, check_out)
  where status <> 'キャンセル';

create index if not exists idx_room_assignments_active_interval
  on public.room_assignments (room_id, stay_start, stay_end)
  where not is_archived;

create index if not exists idx_room_assignments_stay_interval
  on public.room_assignments (stay_start, stay_end)
  where not is_archived;
