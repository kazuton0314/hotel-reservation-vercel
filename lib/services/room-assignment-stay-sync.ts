import type { SupabaseClient } from "@supabase/supabase-js";
import { isoDateOnly } from "@/lib/import/date-utils";

/**
 * 予約の CI/CO 変更に合わせて、当該予約の部屋割 stay 期間を一括追従させる。
 * 部屋割ボード・カレンダー・衝突判定はこの stay_start/stay_end を参照する。
 */
export async function syncAssignmentStayDates(
  supabase: SupabaseClient,
  reservationId: string,
  checkIn: string,
  checkOut: string
): Promise<{ ok: true; updated: number } | { ok: false; message: string }> {
  const start = isoDateOnly(checkIn);
  const end = isoDateOnly(checkOut);
  if (!reservationId || !start || !end) {
    return { ok: false, message: "滞在日が不正です。" };
  }

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("is_archived")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (reservationError) {
    return { ok: false, message: reservationError.message };
  }
  const wantArchived = Boolean(reservation?.is_archived);

  const { data: rows, error: selectError } = await supabase
    .from("room_assignments")
    .select("room_assignment_id, stay_start, stay_end")
    .eq("reservation_id", reservationId)
    .eq("is_archived", wantArchived);
  if (selectError) return { ok: false, message: selectError.message };

  const ids = (rows ?? [])
    .filter(
      (row) =>
        isoDateOnly(row.stay_start) !== start ||
        isoDateOnly(row.stay_end) !== end
    )
    .map((row) => String(row.room_assignment_id ?? "").trim())
    .filter(Boolean);

  if (!ids.length) return { ok: true, updated: 0 };

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("room_assignments")
    .update({
      stay_start: start,
      stay_end: end,
      updated_at: nowIso,
      sheet_updated_at: nowIso,
    })
    .in("room_assignment_id", ids)
    .select("room_assignment_id");

  if (error) return { ok: false, message: error.message };
  return { ok: true, updated: data?.length ?? 0 };
}
