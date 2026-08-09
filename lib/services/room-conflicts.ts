import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDateValue } from "@/lib/import/date-utils";
import { isActiveReservationForRoomAssignment } from "@/lib/services/room-assignment-lifecycle";

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
  reservation_status?: string | null;
  reservation_is_archived?: boolean | null;
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
      type: "update";
      roomAssignmentId: string;
      reservationId: string;
      payload: {
        startDate: string;
        endDate: string;
        roomId?: string;
      };
    }
  | {
      type: "unassign";
      roomAssignmentId: string;
      reservationId: string;
    };

/**
 * 宿泊期間の重複判定（半開区間 [start, end)）。
 * チェックアウト日＝次のチェックイン日の「入れ替え」は重複しない。
 */
export function stayDatesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** YYYY-MM-DD 同士の半開重複。パースできない値は重複なし。 */
export function stayDateStringsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const as = parseDateValue(aStart);
  const ae = parseDateValue(aEnd);
  const bs = parseDateValue(bStart);
  const be = parseDateValue(bEnd);
  if (!as || !ae || !bs || !be) return false;
  return stayDatesOverlap(as, ae, bs, be);
}

function isActiveBatchSimRow(row: BatchSimAssignment): boolean {
  // バッチで新規追加したシミュレーション行は status 未設定。衝突判定には含める。
  if (
    row.reservation_status === undefined &&
    row.reservation_is_archived === undefined
  ) {
    return true;
  }
  return isActiveReservationForRoomAssignment(
    row.reservation_status,
    row.reservation_is_archived
  );
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

  // 半開区間: stay_start < end && stay_end > start（入力は YYYY-MM-DD）
  const startIso = String(input.startDate).trim().slice(0, 10);
  const endIso = String(input.endDate).trim().slice(0, 10);

  const { data: roomAssignments } = await supabase
    .from("room_assignments")
    .select(
      "room_assignment_id, reservation_id, room_name, stay_start, stay_end, reservations!inner(status, is_archived)"
    )
    .eq("room_id", input.roomId)
    .eq("is_archived", false)
    .lt("stay_start", endIso)
    .gt("stay_end", startIso);

  type Row = {
    room_assignment_id: string;
    reservation_id: string;
    room_name: string | null;
    stay_start: string;
    stay_end: string;
    reservations:
      | { status: string; is_archived: boolean }
      | { status: string; is_archived: boolean }[];
  };

  const conflicts = (roomAssignments as Row[] | null ?? []).filter((a) => {
    const res = Array.isArray(a.reservations)
      ? a.reservations[0]
      : a.reservations;
    if (!isActiveReservationForRoomAssignment(res?.status, res?.is_archived)) {
      return false;
    }
    if (excludeIds.has(a.room_assignment_id)) return false;
    return stayDateStringsOverlap(
      a.stay_start,
      a.stay_end,
      startIso,
      endIso
    );
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
 * バッチ変更をメモリ上で適用した「最終状態」に、
 * 今回変更した予約が絡む別グループ重複があるか。
 *
 * - チェックアウト日＝次チェックイン日の入れ替えは重複にしない
 * - 部屋に元からある無関係な重複だけでは警告しない
 *   （一覧設定・部屋割ボードで「入れ替えなのに警告」になる原因だった）
 */
export function hasOtherReservationConflictInFinalState(
  baseline: BatchSimAssignment[],
  changes: BatchRoomChangeForConflict[]
): boolean {
  const byId = new Map<string, BatchSimAssignment>();
  for (const row of baseline) {
    if (!isActiveBatchSimRow(row)) continue;
    byId.set(row.room_assignment_id, { ...row });
  }

  const affectedReservationIds = new Set<string>();
  for (const ch of changes) {
    affectedReservationIds.add(ch.reservationId);
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
    if (ch.type === "update") {
      const row = byId.get(ch.roomAssignmentId);
      if (!row) continue;
      byId.set(ch.roomAssignmentId, {
        ...row,
        room_id: ch.payload.roomId || row.room_id,
        stay_start: ch.payload.startDate,
        stay_end: ch.payload.endDate,
      });
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

  const finalRows = [...byId.values()].filter(isActiveBatchSimRow);
  for (let i = 0; i < finalRows.length; i++) {
    const a = finalRows[i]!;
    if (!a.room_id) continue;
    for (let j = i + 1; j < finalRows.length; j++) {
      const b = finalRows[j]!;
      if (a.room_id !== b.room_id) continue;
      if (a.reservation_id === b.reservation_id) continue;
      // 今回の変更に関係ない既存同士の重複は、この操作の警告に使わない
      if (
        !affectedReservationIds.has(a.reservation_id) &&
        !affectedReservationIds.has(b.reservation_id)
      ) {
        continue;
      }
      if (
        stayDateStringsOverlap(
          a.stay_start,
          a.stay_end,
          b.stay_start,
          b.stay_end
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export const SHARED_ROOM_CONFIRM_MSG =
  "同一部屋に別グループの滞在があります。このまま割り当てますか？";
