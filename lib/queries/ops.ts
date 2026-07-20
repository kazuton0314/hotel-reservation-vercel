import { createReadClient } from "@/lib/supabase/read";
import {
  contactMatches,
  isRequestNeedingLink,
  nameMatches,
  stayMatches,
} from "@/lib/import/match-utils";
import { customerMergeScore, requestReservationMatchScore } from "@/lib/services/matching-score";

export type LinkCandidateSide = {
  id: string;
  name: string | null;
  status: string | null;
  checkIn: string | null;
  checkOut: string | null;
  guestTotal: string | null;
};

export type LinkCandidate = {
  requestId: string;
  reservationId: string;
  score: number;
  /** @deprecated use request.name */
  requestName: string | null;
  /** @deprecated use reservation.name */
  reservationName: string | null;
  /** @deprecated use request.checkIn */
  checkIn: string | null;
  request: LinkCandidateSide;
  reservation: LinkCandidateSide;
  scoreParts: {
    name: boolean;
    contact: boolean;
    stay: boolean;
  };
};

export async function getRequestReservationLinkCandidates(limit = 80) {
  const supabase = await createReadClient();
  const [reqRes, resRes] = await Promise.all([
    supabase
      .from("reservation_requests")
      .select(
        "request_id,status,linked_reservation_id,last_name,first_name,email,phone,check_in,check_out,representative_name,guest_total"
      )
      .eq("is_archived", false),
    supabase
      .from("reservations")
      .select(
        "reservation_id,status,request_id,last_name,first_name,email,phone,check_in,check_out,representative_name,guest_total"
      )
      .eq("is_archived", false),
  ]);
  if (reqRes.error) return { candidates: [] as LinkCandidate[], error: reqRes.error.message };
  if (resRes.error) return { candidates: [] as LinkCandidate[], error: resRes.error.message };

  const requests = (reqRes.data ?? []).filter((r) =>
    isRequestNeedingLink(r.status, r.linked_reservation_id)
  );
  const reservations = (resRes.data ?? []).filter(
    (r) => !r.request_id && r.status !== "キャンセル"
  );
  const out: LinkCandidate[] = [];
  for (const req of requests) {
    let best: LinkCandidate | null = null;
    for (const rsv of reservations) {
      const score = requestReservationMatchScore(req, rsv);
      if (score < 60) continue;
      const scoreParts = {
        name: nameMatches(req.last_name, req.first_name, rsv.last_name, rsv.first_name),
        contact: contactMatches(req.email, req.phone, rsv.email, rsv.phone),
        stay: stayMatches(req.check_in, req.check_out, rsv.check_in, rsv.check_out),
      };
      const candidate: LinkCandidate = {
        requestId: req.request_id,
        reservationId: rsv.reservation_id,
        score,
        requestName: req.representative_name,
        reservationName: rsv.representative_name,
        checkIn: req.check_in,
        request: {
          id: req.request_id,
          name: req.representative_name,
          status: req.status,
          checkIn: req.check_in,
          checkOut: req.check_out,
          guestTotal: req.guest_total != null ? String(req.guest_total) : null,
        },
        reservation: {
          id: rsv.reservation_id,
          name: rsv.representative_name,
          status: rsv.status,
          checkIn: rsv.check_in,
          checkOut: rsv.check_out,
          guestTotal: rsv.guest_total != null ? String(rsv.guest_total) : null,
        },
        scoreParts,
      };
      if (!best || score > best.score) {
        best = candidate;
      }
    }
    if (best) out.push(best);
  }
  return { candidates: out.sort((a, b) => b.score - a.score).slice(0, limit), error: null };
}

export type CustomerMergeCandidate = {
  primaryCustomerId: string;
  duplicateCustomerId: string;
  primaryName: string | null;
  duplicateName: string | null;
  score: number;
};

export async function getCustomerMergeCandidates(limit = 80) {
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("customers")
    .select("customer_id,representative_name,name_kana,email,phone")
    .limit(500);
  if (error) return { candidates: [] as CustomerMergeCandidate[], error: error.message };
  const rows = data ?? [];
  const out: CustomerMergeCandidate[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const score = customerMergeScore(rows[i], rows[j]);
      if (score < 70) continue;
      const [a, b] = [rows[i], rows[j]];
      out.push({
        primaryCustomerId: a.customer_id,
        duplicateCustomerId: b.customer_id,
        primaryName: a.representative_name,
        duplicateName: b.representative_name,
        score,
      });
    }
  }
  return { candidates: out.sort((a, b) => b.score - a.score).slice(0, limit), error: null };
}

export async function getRecentImportJobRuns(limit = 30) {
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("import_job_runs")
    .select("id,job_name,target,status,started_at,finished_at,error_message,details")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    const msg = error.message ?? "";
    if (/import_job_runs/i.test(msg) && /schema cache|does not exist/i.test(msg)) {
      return { runs: [], error: null };
    }
    return { runs: [], error: msg };
  }
  return { runs: data ?? [], error: null };
}
