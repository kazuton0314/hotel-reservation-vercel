import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bookingEntryMatchesForLink,
  isRequestOpenForLink,
  MatchableRequest,
  MatchableReservation,
} from "@/lib/import/match-utils";

export type LinkResult = {
  linked: number;
  repaired: number;
  skipped: number;
  errors: string[];
};

function findReservationForRequest(
  reservations: MatchableReservation[],
  req: MatchableRequest
) {
  return reservations.find((r) => {
    if (r.request_id && r.request_id !== req.request_id) return false;
    if (r.status === "キャンセル") return false;
    return bookingEntryMatchesForLink(r, req);
  });
}

/** linked_reservation_id から reservations.request_id を双方向に修復 */
export async function repairBidirectionalRequestLinks(
  supabase: SupabaseClient
): Promise<{ repaired: number; errors: string[] }> {
  const { data, error } = await supabase
    .from("reservation_requests")
    .select("request_id, linked_reservation_id")
    .not("linked_reservation_id", "is", null);

  if (error) throw error;

  const errors: string[] = [];
  let repaired = 0;
  const nowIso = new Date().toISOString();

  for (const req of data ?? []) {
    const linkedId = req.linked_reservation_id as string;
    const { data: reservation, error: fetchError } = await supabase
      .from("reservations")
      .select("reservation_id, request_id")
      .eq("reservation_id", linkedId)
      .maybeSingle();

    if (fetchError) {
      errors.push(`${req.request_id}: ${fetchError.message}`);
      continue;
    }
    if (!reservation) {
      errors.push(`${req.request_id}: 連携先 ${linkedId} が見つかりません`);
      continue;
    }
    if (reservation.request_id === req.request_id) continue;

    const { error: updateError } = await supabase
      .from("reservations")
      .update({ request_id: req.request_id, updated_at: nowIso })
      .eq("reservation_id", linkedId);

    if (updateError) {
      errors.push(`${req.request_id}: ${updateError.message}`);
      continue;
    }
    repaired++;
  }

  return { repaired, errors };
}

export async function linkExistingRequestsAndReservations(
  supabase: SupabaseClient
): Promise<LinkResult> {
  const [requestsRes, reservationsRes] = await Promise.all([
    supabase
      .from("reservation_requests")
      .select(
        "request_id, status, linked_reservation_id, check_in, check_out, last_name, first_name, email, phone"
      )
      .eq("is_archived", false),
    supabase
      .from("reservations")
      .select(
        "reservation_id, status, request_id, check_in, check_out, last_name, first_name, email, phone, is_archived"
      ),
  ]);

  if (requestsRes.error) throw requestsRes.error;
  if (reservationsRes.error) throw reservationsRes.error;

  const requests = (requestsRes.data ?? []) as MatchableRequest[];
  const reservations = (reservationsRes.data ?? []) as MatchableReservation[];
  const errors: string[] = [];
  let linked = 0;
  let skipped = 0;

  for (const req of requests) {
    if (!isRequestOpenForLink(req.status) || req.linked_reservation_id) {
      skipped++;
      continue;
    }

    const matched = findReservationForRequest(reservations, req);
    if (!matched) {
      skipped++;
      continue;
    }

    const nowIso = new Date().toISOString();
    const [reqUpdate, resUpdate] = await Promise.all([
      supabase
        .from("reservation_requests")
        .update({
          status: "本予約連携済",
          linked_reservation_id: matched.reservation_id,
          updated_at: nowIso,
        })
        .eq("request_id", req.request_id),
      supabase
        .from("reservations")
        .update({
          request_id: req.request_id,
          updated_at: nowIso,
        })
        .eq("reservation_id", matched.reservation_id),
    ]);

    if (reqUpdate.error || resUpdate.error) {
      errors.push(
        `${req.request_id}: ${reqUpdate.error?.message ?? resUpdate.error?.message ?? "link failed"}`
      );
      continue;
    }

    matched.request_id = req.request_id;
    linked++;
  }

  const repair = await repairBidirectionalRequestLinks(supabase);
  errors.push(...repair.errors);

  return {
    linked,
    repaired: repair.repaired,
    skipped,
    errors,
  };
}

/** 過去リクエスト（アーカイブ含む）を本予約と紐づけ */
export async function linkArchivedRequestsToReservations(
  supabase: SupabaseClient
): Promise<LinkResult> {
  const [requestsRes, reservationsRes] = await Promise.all([
    supabase
      .from("reservation_requests")
      .select(
        "request_id, status, linked_reservation_id, check_in, check_out, last_name, first_name, email, phone, is_archived"
      )
      .in("status", ["承認済", "本予約連携済"]),
    supabase
      .from("reservations")
      .select(
        "reservation_id, status, request_id, check_in, check_out, last_name, first_name, email, phone, is_archived"
      ),
  ]);

  if (requestsRes.error) throw requestsRes.error;
  if (reservationsRes.error) throw reservationsRes.error;

  const requests = (requestsRes.data ?? []) as MatchableRequest[];
  const reservations = (reservationsRes.data ?? []) as MatchableReservation[];
  const errors: string[] = [];
  let linked = 0;
  let skipped = 0;

  for (const req of requests) {
    if (req.linked_reservation_id) {
      skipped++;
      continue;
    }
    if (req.status !== "承認済" && req.status !== "本予約連携済") {
      skipped++;
      continue;
    }

    const matched = findReservationForRequest(reservations, req);
    if (!matched) {
      skipped++;
      continue;
    }

    const nowIso = new Date().toISOString();
    const nextStatus = req.status === "承認済" ? "本予約連携済" : req.status;
    const [reqUpdate, resUpdate] = await Promise.all([
      supabase
        .from("reservation_requests")
        .update({
          status: nextStatus,
          linked_reservation_id: matched.reservation_id,
          updated_at: nowIso,
        })
        .eq("request_id", req.request_id),
      supabase
        .from("reservations")
        .update({
          request_id: req.request_id,
          updated_at: nowIso,
        })
        .eq("reservation_id", matched.reservation_id),
    ]);

    if (reqUpdate.error || resUpdate.error) {
      errors.push(
        `${req.request_id}: ${reqUpdate.error?.message ?? resUpdate.error?.message ?? "link failed"}`
      );
      continue;
    }

    linked++;
  }

  const repair = await repairBidirectionalRequestLinks(supabase);
  errors.push(...repair.errors);

  return {
    linked,
    repaired: repair.repaired,
    skipped,
    errors,
  };
}
