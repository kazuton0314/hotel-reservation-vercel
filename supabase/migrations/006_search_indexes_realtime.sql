-- Search performance indexes + realtime publication

create index if not exists idx_reservations_customer_id
  on public.reservations (customer_id)
  where not is_archived;

create index if not exists idx_reservations_check_out_active
  on public.reservations (check_out)
  where not is_archived;

create index if not exists idx_reservations_assignment_status
  on public.reservations (assignment_status)
  where not is_archived and status = '確定';

create index if not exists idx_customers_customer_id_lower
  on public.customers (lower(customer_id));

create index if not exists idx_reservation_requests_status_active
  on public.reservation_requests (status, check_in)
  where not is_archived;

-- Enable realtime for collaborative views (safe if already added)
do $$
begin
  alter publication supabase_realtime add table public.reservations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.room_assignments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.reservation_requests;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.customers;
exception when duplicate_object then null;
end $$;
