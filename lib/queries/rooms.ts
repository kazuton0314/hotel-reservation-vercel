import { createClient } from "@/lib/supabase/server";

export type RoomItem = {
  room_id: string;
  room_name: string;
  sort_order: number;
};

export type RoomAssignmentBoardItem = {
  room_assignment_id: string;
  reservation_id: string;
  room_id: string | null;
  room_name: string | null;
  stay_start: string;
  stay_end: string;
  assigned_guest_count: number | null;
};

export async function getRooms() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("room_id, room_name, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return {
    rooms: (data ?? []) as RoomItem[],
    error: error?.message ?? null,
  };
}

export async function getRoomAssignmentsForRange(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_assignments")
    .select(
      "room_assignment_id, reservation_id, room_id, room_name, stay_start, stay_end, assigned_guest_count"
    )
    .eq("is_archived", false)
    .lte("stay_start", to)
    .gte("stay_end", from)
    .order("stay_start", { ascending: true });

  return {
    assignments: (data ?? []) as RoomAssignmentBoardItem[],
    error: error?.message ?? null,
  };
}
