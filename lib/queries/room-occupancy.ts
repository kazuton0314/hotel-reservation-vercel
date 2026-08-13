import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { fetchAssignmentsForReservationIds } from "@/lib/queries/room-assignment-lookup";
import { createReadClient } from "@/lib/supabase/read";
import {
  buildRoomOccupancyMonthView,
  type RoomOccupancyMonthView,
} from "@/lib/services/room-occupancy";
import { includeArchivedForDateRange } from "@/lib/utils/list-scope";

const ASSIGNMENT_SELECT =
  "room_assignment_id, reservation_id, room_id, stay_start, stay_end, assigned_guest_count, male_count, female_count, boy_student_count, girl_student_count, age_3plus_count, under_3_count, updated_at";

function monthBounds(year: number, month: number) {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { monthStart, monthEnd };
}

export async function getRoomOccupancyMonthView(
  year: number,
  month: number
): Promise<{ data: RoomOccupancyMonthView | null; error: string | null }> {
  return unstable_cache(
    () => getRoomOccupancyMonthViewUncached(year, month),
    ["room-occupancy", String(year), String(month)],
    { tags: [CACHE_TAGS.rooms, CACHE_TAGS.calendar], revalidate: 60 }
  )();
}

async function getRoomOccupancyMonthViewUncached(
  year: number,
  month: number
): Promise<{ data: RoomOccupancyMonthView | null; error: string | null }> {
  const { monthStart, monthEnd } = monthBounds(year, month);
  const supabase = await createReadClient();
  const withArchived = includeArchivedForDateRange(monthStart);

  let reservationsQuery = supabase
    .from("reservations")
    .select(
      "reservation_id, representative_name, status, check_in, check_out, nights, guest_total, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3, bbq, somen, channel, assignment_status"
    )
    .lte("check_in", monthEnd)
    .gte("check_out", monthStart);

  if (!withArchived) {
    reservationsQuery = reservationsQuery.eq("is_archived", false);
  }

  const [
    { data: rooms, error: roomsError },
    { data: reservations, error: resError },
  ] = await Promise.all([
    supabase
      .from("rooms")
      .select("room_id, room_name, room_type, capacity, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    reservationsQuery,
  ]);

  if (roomsError) return { data: null, error: roomsError.message };
  if (resError) return { data: null, error: resError.message };

  const { data: assignments, error: assignError } =
    await fetchAssignmentsForReservationIds<{
      room_assignment_id: string;
      reservation_id: string;
      room_id: string | null;
      stay_start: string;
      stay_end: string;
      assigned_guest_count: number | null;
      male_count: number | null;
      female_count: number | null;
      boy_student_count: number | null;
      girl_student_count: number | null;
      age_3plus_count: number | null;
      under_3_count: number | null;
      updated_at: string | null;
    }>(
      supabase,
      (reservations ?? []).map((r) => String(r.reservation_id ?? "")),
      ASSIGNMENT_SELECT,
      withArchived
    );
  if (assignError) return { data: null, error: assignError };

  const data = buildRoomOccupancyMonthView(
    year,
    month,
    rooms ?? [],
    reservations ?? [],
    assignments ?? []
  );

  return { data, error: null };
}
