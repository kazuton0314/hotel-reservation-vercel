import { createReadClient } from "@/lib/supabase/read";
import {
  contactMatches,
  isRequestNeedingLink,
  nameMatches,
  stayMatches,
} from "@/lib/import/match-utils";
import { customerMergeScore, requestReservationMatchScore } from "@/lib/services/matching-score";
import { todayIso } from "@/lib/utils/date-label";

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

/** 突合の予約候補上限（全件走査を避ける） */
const LINK_RESERVATION_FETCH_CAP = 250;
/** 顧客突合の取得上限 */
const MERGE_CUSTOMER_FETCH_CAP = 200;

export async function getRequestReservationLinkCandidates(limit = 80) {
  const supabase = await createReadClient();
  const today = todayIso();
  const [reqRes, resRes] = await Promise.all([
    supabase
      .from("reservation_requests")
      .select(
        "request_id,status,linked_reservation_id,last_name,first_name,email,phone,check_in,check_out,representative_name,guest_total"
      )
      .eq("is_archived", false)
      .is("linked_reservation_id", null)
      .in("status", ["リクエスト", "承認済", "本予約連携済"])
      .gte("check_out", today)
      .order("check_in", { ascending: true, nullsFirst: false })
      .limit(120),
    supabase
      .from("reservations")
      .select(
        "reservation_id,status,request_id,last_name,first_name,email,phone,check_in,check_out,representative_name,guest_total"
      )
      .eq("is_archived", false)
      .is("request_id", null)
      .neq("status", "キャンセル")
      .gte("check_out", today)
      .order("check_in", { ascending: true, nullsFirst: false })
      .limit(LINK_RESERVATION_FETCH_CAP),
  ]);
  if (reqRes.error) return { candidates: [] as LinkCandidate[], error: reqRes.error.message };
  if (resRes.error) return { candidates: [] as LinkCandidate[], error: resRes.error.message };

  const requests = (reqRes.data ?? []).filter((r) =>
    isRequestNeedingLink(r.status, r.linked_reservation_id)
  );
  const reservations = resRes.data ?? [];
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
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(MERGE_CUSTOMER_FETCH_CAP);
  if (error) return { candidates: [] as CustomerMergeCandidate[], error: error.message };
  const rows = data ?? [];

  // メール/電話が同じバケット内だけで突き合わせ（全対全を避ける）
  const buckets = new Map<string, typeof rows>();
  for (const row of rows) {
    const email = String(row.email ?? "").trim().toLowerCase();
    const phone = String(row.phone ?? "").replace(/\D/g, "");
    const keys = [
      email ? `e:${email}` : "",
      phone.length >= 8 ? `p:${phone}` : "",
    ].filter(Boolean);
    if (!keys.length) continue;
    for (const key of keys) {
      const list = buckets.get(key) ?? [];
      list.push(row);
      buckets.set(key, list);
    }
  }

  const seen = new Set<string>();
  const out: CustomerMergeCandidate[] = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const pairKey = [a.customer_id, b.customer_id].sort().join("|");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const score = customerMergeScore(a, b);
        if (score < 70) continue;
        out.push({
          primaryCustomerId: a.customer_id,
          duplicateCustomerId: b.customer_id,
          primaryName: a.representative_name,
          duplicateName: b.representative_name,
          score,
        });
      }
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
