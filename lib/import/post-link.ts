import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bookingEntryMatchesForLink,
  isRequestOpenForLink,
  MatchableRequest,
  MatchableReservation,
} from "@/lib/import/match-utils";

type LinkResult = {
  linked: number;
  skipped: number;
  errors: string[];
};

function findReservationForRequest(
  reservations: MatchableReservation[],
  req: MatchableRequest
) {
  return reservations.find((r) => {
    if (r.request_id) return false;
    if (r.status === "キャンセル") return false;
    return bookingEntryMatchesForLink(r, req);
  });
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
        "reservation_id, status, request_id, check_in, check_out, last_name, first_name, email, phone"
      )
      .eq("is_archived", false),
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

  return { linked, skipped, errors };
}
