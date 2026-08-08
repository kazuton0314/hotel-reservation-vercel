import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 予約の CI/CO 変更に合わせて、当該予約の部屋割 stay 期間を一括追従させる。
 * 部屋割ボード表示もこの stay_start/stay_end を参照する。
 */
export async function syncAssignmentStayDates(
  supabase: SupabaseClient,
  reservationId: string,
  checkIn: string,
  checkOut: string
): Promise<{ ok: true; updated: number } | { ok: false; message: string }> {
  const start = String(checkIn ?? "").trim();
  const end = String(checkOut ?? "").trim();
  if (!reservationId || !start || !end) {
    return { ok: false, message: "滞在日が不正です。" };
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("room_assignments")
    .update({
      stay_start: start,
      stay_end: end,
      updated_at: nowIso,
      sheet_updated_at: nowIso,
    })
    .eq("reservation_id", reservationId)
    .eq("is_archived", false)
    .select("room_assignment_id");

  if (error) return { ok: false, message: error.message };
  return { ok: true, updated: data?.length ?? 0 };
}
