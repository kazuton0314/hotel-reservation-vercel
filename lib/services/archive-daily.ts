import type { SupabaseClient } from "@supabase/supabase-js";

export type ArchiveDailyResult = {
  reservations: number;
  roomAssignments: number;
  requests: number;
};

/** checkout < today のアクティブ行を is_archived=true に（GAS ArchiveService 相当・論理アーカイブ） */
export async function runDailyArchive(
  supabase: SupabaseClient
): Promise<ArchiveDailyResult> {
  const today = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const [resResult, reqResult] = await Promise.all([
    supabase
      .from("reservations")
      .update({ is_archived: true, updated_at: nowIso })
      .eq("is_archived", false)
      .lt("check_out", today)
      .select("reservation_id"),
    supabase
      .from("reservation_requests")
      .update({ is_archived: true, updated_at: nowIso })
      .eq("is_archived", false)
      .lt("check_out", today)
      .select("request_id"),
  ]);

  if (resResult.error) throw resResult.error;
  if (reqResult.error) throw reqResult.error;

  const reservationIds = (resResult.data ?? []).map((r) => r.reservation_id);

  let roomAssignments = 0;
  if (reservationIds.length) {
    const { data: raData, error: raError } = await supabase
      .from("room_assignments")
      .update({ is_archived: true, updated_at: nowIso })
      .eq("is_archived", false)
      .in("reservation_id", reservationIds)
      .select("room_assignment_id");
    if (raError) throw raError;
    roomAssignments = raData?.length ?? 0;
  }

  return {
    reservations: resResult.data?.length ?? 0,
    roomAssignments,
    requests: reqResult.data?.length ?? 0,
  };
}
