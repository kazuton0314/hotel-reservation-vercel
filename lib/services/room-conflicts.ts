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
  /** バッチ確定時: この部屋から離れる予定の割当は衝突判定から除外 */
  excludeAssignmentIds?: string[] | null;
};

export type BatchSimAssignment = {
  room_assignment_id: string;
  reservation_id: string;
  room_id: string;
  stay_start: string;
  stay_end: string;
};

export type BatchRoomChangeForConflict =
  | {
      type: "move";
      roomAssignmentId: string;
      toRoomId: string;
      reservationId: string;
    }
  | {
      type: "assign";
      reservationId: string;
      payload: {
        reservationId: string;
        roomId: string;
        startDate: string;
        endDate: string;
      };
    }
  | {
      type: "unassign";
      roomAssignmentId: string;
      reservationId: string;
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
  const excludeIds = new Set<string>();
  if (input.excludeAssignmentId) {
    excludeIds.add(input.excludeAssignmentId);
  }
  for (const id of input.excludeAssignmentIds ?? []) {
    if (id) excludeIds.add(id);
  }

  // datesOverlap: stay_start < end && stay_end > start（入力は YYYY-MM-DD）
  const startIso = String(input.startDate).trim().slice(0, 10);
  const endIso = String(input.endDate).trim().slice(0, 10);

  const { data: roomAssignments } = await supabase
    .from("room_assignments")
    .select(
      "room_assignment_id, reservation_id, room_name, stay_start, stay_end"
    )
    .eq("room_id", input.roomId)
    .eq("is_archived", false)
    .lt("stay_start", endIso)
    .gt("stay_end", startIso);

  const conflicts = (roomAssignments ?? []).filter((a) => {
    if (excludeIds.has(a.room_assignment_id)) return false;
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

/**
 * バッチ変更をメモリ上で適用した「最終状態」に別グループ重複があるか。
 * 途中経過（A→B の前に C→A など）では判定しない。
 */
export function hasOtherReservationConflictInFinalState(
  baseline: BatchSimAssignment[],
  changes: BatchRoomChangeForConflict[]
): boolean {
  const byId = new Map<string, BatchSimAssignment>();
  for (const row of baseline) {
    byId.set(row.room_assignment_id, { ...row });
  }

  let tempId = 0;
  for (const ch of changes) {
    if (ch.type === "unassign") {
      byId.delete(ch.roomAssignmentId);
      continue;
    }
    if (ch.type === "move") {
      const row = byId.get(ch.roomAssignmentId);
      if (!row) continue;
      byId.set(ch.roomAssignmentId, { ...row, room_id: ch.toRoomId });
      continue;
    }
    const p = ch.payload;
    tempId += 1;
    byId.set(`__new_${tempId}`, {
      room_assignment_id: `__new_${tempId}`,
      reservation_id: p.reservationId,
      room_id: p.roomId,
      stay_start: p.startDate,
      stay_end: p.endDate,
    });
  }

  const finalRows = [...byId.values()];
  for (let i = 0; i < finalRows.length; i++) {
    const a = finalRows[i]!;
    const aStart = parseDateValue(a.stay_start);
    const aEnd = parseDateValue(a.stay_end);
    if (!aStart || !aEnd || !a.room_id) continue;
    for (let j = i + 1; j < finalRows.length; j++) {
      const b = finalRows[j]!;
      if (a.room_id !== b.room_id) continue;
      if (a.reservation_id === b.reservation_id) continue;
      const bStart = parseDateValue(b.stay_start);
      const bEnd = parseDateValue(b.stay_end);
      if (!bStart || !bEnd) continue;
      if (datesOverlap(aStart, aEnd, bStart, bEnd)) return true;
    }
  }
  return false;
}

export const SHARED_ROOM_CONFIRM_MSG =
  "同一部屋に別グループの滞在があります。このまま割り当てますか？";
