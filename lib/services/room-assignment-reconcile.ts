import type { SupabaseClient } from "@supabase/supabase-js";

type AssignmentRow = {
  room_assignment_id: string;
  room_id: string | null;
  stay_start: string | null;
  stay_end: string | null;
  is_archived: boolean | null;
  updated_at: string | null;
};

function assignmentKey(row: AssignmentRow): string {
  return [
    String(row.room_id ?? ""),
    String(row.stay_start ?? "").slice(0, 10),
    String(row.stay_end ?? "").slice(0, 10),
  ].join("|");
}

/** 同一部屋・同一期間の重複があるか（表示用） */
export function hasDuplicateRoomAssignments(
  rows: Array<{
    room_id?: string | null;
    stay_start?: string | null;
    stay_end?: string | null;
  }>
): boolean {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = [
      String(row.room_id ?? ""),
      String(row.stay_start ?? "").slice(0, 10),
      String(row.stay_end ?? "").slice(0, 10),
    ].join("|");
    if (!row.room_id) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * 同一予約・同一部屋・同一期間の部屋割が複数あるとき、1件に畳む。
 * アーカイブ編集で is_archived=true の既存行と false の新規行が並ぶ事故を解消する。
 * 残す行は「予約の archive フラグと一致するもの」を優先し、続けて updated_at が新しいもの。
 */
export async function reconcileDuplicateRoomAssignments(
  supabase: SupabaseClient,
  reservationId: string
): Promise<number> {
  const [{ data: reservation }, { data: rows, error }] = await Promise.all([
    supabase
      .from("reservations")
      .select("is_archived")
      .eq("reservation_id", reservationId)
      .maybeSingle(),
    supabase
      .from("room_assignments")
      .select(
        "room_assignment_id, room_id, stay_start, stay_end, is_archived, updated_at"
      )
      .eq("reservation_id", reservationId),
  ]);

  if (error) throw error;
  if (!rows?.length) return 0;

  const wantArchived = Boolean(reservation?.is_archived);
  const groups = new Map<string, AssignmentRow[]>();
  for (const row of rows as AssignmentRow[]) {
    if (!row.room_id) continue;
    const key = assignmentKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  let removed = 0;
  const nowIso = new Date().toISOString();

  for (const group of groups.values()) {
    if (group.length <= 1) {
      const only = group[0];
      if (only && Boolean(only.is_archived) !== wantArchived) {
        await supabase
          .from("room_assignments")
          .update({ is_archived: wantArchived, updated_at: nowIso })
          .eq("room_assignment_id", only.room_assignment_id);
      }
      continue;
    }

    group.sort((a, b) => {
      const aMatch = Boolean(a.is_archived) === wantArchived ? 1 : 0;
      const bMatch = Boolean(b.is_archived) === wantArchived ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
    });

    const keep = group[0];
    const dropIds = group.slice(1).map((r) => r.room_assignment_id);

    if (Boolean(keep.is_archived) !== wantArchived) {
      await supabase
        .from("room_assignments")
        .update({ is_archived: wantArchived, updated_at: nowIso })
        .eq("room_assignment_id", keep.room_assignment_id);
    }

    if (dropIds.length) {
      const { error: delError } = await supabase
        .from("room_assignments")
        .delete()
        .in("room_assignment_id", dropIds);
      if (delError) throw delError;
      removed += dropIds.length;
    }
  }

  return removed;
}
