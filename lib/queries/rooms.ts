import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { createReadClient } from "@/lib/supabase/read";
import { includeArchivedForDateRange } from "@/lib/utils/list-scope";

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
  return unstable_cache(
    async () => {
      const supabase = await createReadClient();
      const { data, error } = await supabase
        .from("rooms")
        .select("room_id, room_name, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      return {
        rooms: (data ?? []) as RoomItem[],
        error: error?.message ?? null,
      };
    },
    ["rooms-active"],
    { tags: [CACHE_TAGS.rooms], revalidate: 300 }
  )();
}

export async function getRoomAssignmentsForRange(from: string, to: string) {
  const supabase = await createReadClient();
  const withArchived = includeArchivedForDateRange(from);

  let query = supabase
    .from("room_assignments")
    .select(
      "room_assignment_id, reservation_id, room_id, room_name, stay_start, stay_end, assigned_guest_count"
    )
    .lte("stay_start", to)
    .gte("stay_end", from)
    .order("stay_start", { ascending: true });

  if (!withArchived) {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query;

  return {
    assignments: (data ?? []) as RoomAssignmentBoardItem[],
    error: error?.message ?? null,
  };
}
