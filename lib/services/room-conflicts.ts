import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDateValue } from "@/lib/import/date-utils";

export type RoomConflictItem = {
  room_assignment_id: string;
  reservation_id: string;
  room_name: string | null;
  stay_start: string;
  stay_end: string;
};

export type RoomConflictResult = {
  hasConflict: boolean;
  hasOtherReservationConflict: boolean;
  conflicts: RoomConflictItem[];
};

type ConflictInput = {
  roomId: string;
  startDate: string;
  endDate: string;
  reservationId?: string;
  excludeAssignmentId?: string | null;
};

function datesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** GAS checkRoomConflict 相当 */
export async function checkRoomConflict(
  supabase: SupabaseClient,
  input: ConflictInput
): Promise<RoomConflictResult> {
  const start = parseDateValue(input.startDate);
  const end = parseDateValue(input.endDate);
  if (!input.roomId || !start || !end) {
    return {
      hasConflict: false,
      hasOtherReservationConflict: false,
      conflicts: [],
    };
  }

  const ownReservationId = String(input.reservationId ?? "").trim();

  const { data: roomAssignments } = await supabase
    .from("room_assignments")
    .select(
      "room_assignment_id, reservation_id, room_name, stay_start, stay_end"
    )
    .eq("room_id", input.roomId)
    .eq("is_archived", false);

  const conflicts = (roomAssignments ?? []).filter((a) => {
    if (
      input.excludeAssignmentId &&
      a.room_assignment_id === input.excludeAssignmentId
    ) {
      return false;
    }
    const aStart = parseDateValue(a.stay_start);
    const aEnd = parseDateValue(a.stay_end);
    if (!aStart || !aEnd) return false;
    return datesOverlap(aStart, aEnd, start, end);
  });

  const otherReservationConflicts = conflicts.filter(
    (c) => String(c.reservation_id) !== ownReservationId
  );

  return {
    hasConflict: conflicts.length > 0,
    hasOtherReservationConflict: otherReservationConflicts.length > 0,
    conflicts: conflicts.map((c) => ({
      room_assignment_id: c.room_assignment_id,
      reservation_id: c.reservation_id,
      room_name: c.room_name,
      stay_start: c.stay_start,
      stay_end: c.stay_end,
    })),
  };
}

export const SHARED_ROOM_CONFIRM_MSG =
  "同一部屋に別グループの滞在があります。このまま割り当てますか？";
