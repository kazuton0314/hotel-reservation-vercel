import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 予約の CI/CO 期間でボードを描くため、stay 日付ではなく予約IDで割当を取る。
 * stay が未同期でも、当月・当日の予約に紐づく部屋割を落とさない。
 */
export async function fetchAssignmentsForReservationIds<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  reservationIds: string[],
  select: string,
  withArchived: boolean
): Promise<{ data: T[]; error: string | null }> {
  const ids = [...new Set(reservationIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!ids.length) return { data: [], error: null };

  let query = supabase
    .from("room_assignments")
    .select(select)
    .in("reservation_id", ids);
  if (!withArchived) {
    query = query.eq("is_archived", false);
  }
  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as T[], error: null };
}
