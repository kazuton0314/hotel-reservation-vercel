import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import {
  bookingEntryMatchesForLink,
  isRequestNeedingLink,
} from "@/lib/import/match-utils";
import { requestReservationMatchScore } from "@/lib/services/matching-score";

loadEnvLocal();

type Req = {
  request_id: string;
  status: string;
  linked_reservation_id: string | null;
  representative_name: string | null;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  check_in: string | null;
  check_out: string | null;
  is_archived: boolean;
};

type Res = {
  reservation_id: string;
  status: string;
  request_id: string | null;
  representative_name: string | null;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  check_in: string | null;
  check_out: string | null;
  is_archived: boolean;
};

async function fetchAll<T>(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  select: string
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  const supabase = createAdminClient();
  const requests = await fetchAll<Req>(
    supabase,
    "reservation_requests",
    "request_id,status,linked_reservation_id,representative_name,last_name,first_name,email,phone,check_in,check_out,is_archived"
  );
  const reservations = await fetchAll<Res>(
    supabase,
    "reservations",
    "reservation_id,status,request_id,representative_name,last_name,first_name,email,phone,check_in,check_out,is_archived"
  );
  const resById = new Map(reservations.map((r) => [r.reservation_id, r]));
  const reqById = new Map(requests.map((r) => [r.request_id, r]));

  const issues: string[] = [];

  // A: request has linked id, reservation missing or points elsewhere
  for (const req of requests) {
    const lid = req.linked_reservation_id;
    if (!lid) continue;
    const res = resById.get(lid);
    if (!res) {
      issues.push(`RQ→欠損 ${req.request_id} → ${lid} (予約なし)`);
      continue;
    }
    if (res.request_id !== req.request_id) {
      issues.push(
        `RQ→片方向 ${req.request_id} → ${lid} だが MT.request_id=${res.request_id ?? "null"}`
      );
    }
  }

  // B: reservation has request_id, request missing or points elsewhere
  for (const res of reservations) {
    const rid = res.request_id;
    if (!rid) continue;
    const req = reqById.get(rid);
    if (!req) {
      issues.push(`MT→欠損 ${res.reservation_id} → ${rid} (リクエストなし)`);
      continue;
    }
    if (req.linked_reservation_id !== res.reservation_id) {
      issues.push(
        `MT→片方向 ${res.reservation_id} → ${rid} だが RQ.linked=${req.linked_reservation_id ?? "null"}`
      );
    }
  }

  // C: status / link consistency
  for (const req of requests) {
    if (req.status === "本予約連携済") {
      issues.push(
        `レガシーステータス ${req.request_id} 本予約連携済 (linked=${req.linked_reservation_id ?? "null"})`
      );
    }
    if (
      req.linked_reservation_id &&
      req.status !== "承認済"
    ) {
      issues.push(
        `リンクあるがstatus=${req.status} ${req.request_id} → ${req.linked_reservation_id}`
      );
    }
  }

  // D: two requests pointing to same reservation
  const byLinked = new Map<string, string[]>();
  for (const req of requests) {
    if (!req.linked_reservation_id) continue;
    const list = byLinked.get(req.linked_reservation_id) ?? [];
    list.push(req.request_id);
    byLinked.set(req.linked_reservation_id, list);
  }
  for (const [mt, rqs] of byLinked) {
    if (rqs.length > 1) {
      issues.push(`複数RQが同一MT ${mt}: ${rqs.join(", ")}`);
    }
  }

  // E: two reservations pointing to same request
  const byReqOnMt = new Map<string, string[]>();
  for (const res of reservations) {
    if (!res.request_id) continue;
    const list = byReqOnMt.get(res.request_id) ?? [];
    list.push(res.reservation_id);
    byReqOnMt.set(res.request_id, list);
  }
  for (const [rq, mts] of byReqOnMt) {
    if (mts.length > 1) {
      issues.push(`複数MTが同一RQ ${rq}: ${mts.join(", ")}`);
    }
  }

  console.log("=== リンク整合性 ===");
  console.log(`issues: ${issues.length}`);
  for (const i of issues) console.log(`  - ${i}`);

  const needing = requests.filter(
    (r) => !r.is_archived && isRequestNeedingLink(r.status, r.linked_reservation_id)
  );
  const unlinkedMt = reservations.filter(
    (r) => !r.is_archived && !r.request_id && r.status !== "キャンセル"
  );
  console.log("\n=== 要リンク候補の自動一致 ===");
  for (const req of needing) {
    const auto = unlinkedMt.find((r) => bookingEntryMatchesForLink(req, r));
    const scored = unlinkedMt
      .map((r) => ({ r, score: requestReservationMatchScore(req, r) }))
      .filter((x) => x.score >= 60)
      .sort((a, b) => b.score - a.score);
    console.log(
      `${req.request_id} ${req.status} ${req.representative_name} ${req.check_in}`
    );
    console.log(
      `  auto=${auto?.reservation_id ?? "なし"} review=${scored.map((s) => `${s.r.reservation_id}(${s.score})`).join(", ") || "なし"}`
    );
  }

  // status counts for linked
  const linked = requests.filter((r) => r.linked_reservation_id);
  const linkedByStatus = new Map<string, number>();
  for (const r of linked) {
    linkedByStatus.set(r.status, (linkedByStatus.get(r.status) ?? 0) + 1);
  }
  console.log(`\nリンクあり件数: ${linked.length}`);
  console.log("  status内訳:", Object.fromEntries(linkedByStatus));

  const linkedStatus = requests.filter((r) => r.status === "本予約連携済");
  console.log(`本予約連携済件数: ${linkedStatus.length}`);
  console.log(
    `  うち linked あり: ${linkedStatus.filter((r) => r.linked_reservation_id).length}`
  );
  console.log(
    `  うち linked なし: ${linkedStatus.filter((r) => !r.linked_reservation_id).length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
