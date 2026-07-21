import type { SupabaseClient } from "@supabase/supabase-js";
import { syncAssignmentStatus } from "@/lib/services/assignment-status";

const INACTIVE_STATUSES = new Set(["キャンセル", "不可"]);

/** 部屋割の衝突判定・ボード表示の対象になる予約か */
export function isActiveReservationForRoomAssignment(
  status: string | null | undefined,
  isArchived?: boolean | null
): boolean {
  if (isArchived) return false;
  const s = String(status ?? "").trim();
  if (!s || INACTIVE_STATUSES.has(s)) return false;
  return true;
}

export function shouldClearRoomAssignmentsOnStatus(
  status: string | null | undefined
): boolean {
  const s = String(status ?? "").trim();
  return INACTIVE_STATUSES.has(s);
}

/** キャンセル等で部屋割を物理削除し assignment_status を同期 */
export async function clearRoomAssignmentsForReservation(
  supabase: SupabaseClient,
  reservationId: string
): Promise<number> {
  const { data: existing } = await supabase
    .from("room_assignments")
    .select("room_assignment_id")
    .eq("reservation_id", reservationId)
    .eq("is_archived", false);

  const count = existing?.length ?? 0;
  if (!count) {
    await syncAssignmentStatus(supabase, reservationId);
    return 0;
  }

  const { error } = await supabase
    .from("room_assignments")
    .delete()
    .eq("reservation_id", reservationId);

  if (error) throw error;
  await syncAssignmentStatus(supabase, reservationId);
  return count;
}
