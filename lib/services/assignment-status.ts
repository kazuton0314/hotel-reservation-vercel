import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULTS } from "@/lib/config/forms";

const ASSIGNED = "割当済";
const UNASSIGNED = DEFAULTS.assignmentStatus;

/**
 * assignment_status は room_assignments からの派生キャッシュ。
 * 割当 CRUD のたびに必ず呼ぶ。直接書き込まず、ここに同期させる。
 */
export async function syncAssignmentStatus(
  supabase: SupabaseClient,
  reservationId: string
): Promise<string> {
  const { data } = await supabase
    .from("room_assignments")
    .select("room_assignment_id")
    .eq("reservation_id", reservationId)
    .eq("is_archived", false);

  const status = (data?.length ?? 0) > 0 ? ASSIGNED : UNASSIGNED;
  await supabase
    .from("reservations")
    .update({
      assignment_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("reservation_id", reservationId);

  return status;
}
