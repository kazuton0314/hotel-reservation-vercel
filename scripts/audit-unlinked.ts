import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import {
  bookingEntryMatchesForLink,
  isRequestNeedingLink,
  nameMatches,
  contactMatches,
  stayMatches,
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
  guest_total: number | string | null;
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
  guest_total: number | string | null;
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

function brief(r: {
  representative_name?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  guest_total?: number | string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
}) {
  const name =
    r.representative_name ||
    [r.last_name, r.first_name].filter(Boolean).join("") ||
    "—";
  return `${name} | ${r.check_in ?? "?"}〜${r.check_out ?? "?"} | ${r.guest_total ?? "?"}名 | ${r.status ?? ""} | mail=${r.email ?? ""} | tel=${r.phone ?? ""}`;
}

async function main() {
  const supabase = createAdminClient();
  const selectReq =
    "request_id,status,linked_reservation_id,representative_name,last_name,first_name,email,phone,check_in,check_out,guest_total,is_archived";
  const selectRes =
    "reservation_id,status,request_id,representative_name,last_name,first_name,email,phone,check_in,check_out,guest_total,is_archived";

  const [requests, reservations] = await Promise.all([
    fetchAll<Req>(supabase, "reservation_requests", selectReq),
    fetchAll<Res>(supabase, "reservations", selectRes),
  ]);

  const resById = new Map(reservations.map((r) => [r.reservation_id, r]));
  const reqById = new Map(requests.map((r) => [r.request_id, r]));

  // --- counts ---
  const openUnlinked = requests.filter(
    (r) =>
      !r.is_archived &&
      isRequestNeedingLink(r.status, r.linked_reservation_id)
  );
  const linkedOk = requests.filter((r) => r.linked_reservation_id);
  const linkedBroken = linkedOk.filter((r) => {
    const res = resById.get(r.linked_reservation_id!);
    return !res || res.request_id !== r.request_id;
  });
  const resWithReq = reservations.filter((r) => r.request_id);
  const resOrphanLink = resWithReq.filter((r) => {
    const req = reqById.get(r.request_id!);
    return !req || req.linked_reservation_id !== r.reservation_id;
  });
  const unlinkedReservations = reservations.filter(
    (r) => !r.is_archived && !r.request_id && r.status !== "キャンセル"
  );

  console.log("=== 件数サマリ ===");
  console.log(`リクエスト総数: ${requests.length}`);
  console.log(`本予約総数: ${reservations.length}`);
  console.log(
    `未アーカイブ & リンク必要 (リクエスト|承認済|本予約連携済欠落) & linked無し: ${openUnlinked.length}`
  );
  console.log(`linked_reservation_id あり: ${linkedOk.length}`);
  console.log(`  うち双方向不一致/欠損: ${linkedBroken.length}`);
  console.log(`本予約に request_id あり: ${resWithReq.length}`);
  console.log(`  うち双方向不一致/欠損: ${resOrphanLink.length}`);
  console.log(
    `未アーカイブ本予約で request_id 無し（キャンセル除く）: ${unlinkedReservations.length}`
  );

  // status breakdown of open unlinked
  const byStatus = new Map<string, number>();
  for (const r of openUnlinked) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  }
  console.log("未連携オープン ステータス内訳:", Object.fromEntries(byStatus));

  // also count 本予約連携済 without link (anomaly)
  const linkedStatusNoId = requests.filter(
    (r) => r.status === "本予約連携済" && !r.linked_reservation_id
  );
  console.log(`本予約連携済なのに linked無し: ${linkedStatusNoId.length}`);

  // --- auto-link eligible (strict bookingEntryMatchesForLink) ---
  const autoEligible: { req: Req; res: Res }[] = [];
  for (const req of openUnlinked) {
    const matched = unlinkedReservations.find((r) => {
      if (r.request_id && r.request_id !== req.request_id) return false;
      return bookingEntryMatchesForLink(r, req);
    });
    if (matched) autoEligible.push({ req, res: matched });
  }
  console.log(
    `\n自動リンク条件（姓名+連絡先+CI月日）に合う未連携: ${autoEligible.length}`
  );
  for (const { req, res } of autoEligible.slice(0, 30)) {
    console.log(
      `  ${req.request_id} ↔ ${res.reservation_id}\n    RQ: ${brief(req)}\n    MT: ${brief(res)}`
    );
  }

  // --- review candidates (score >= 60) ---
  const review: {
    req: Req;
    res: Res;
    score: number;
    parts: string;
  }[] = [];
  for (const req of openUnlinked) {
    let best: (typeof review)[number] | null = null;
    for (const rsv of unlinkedReservations) {
      const score = requestReservationMatchScore(req, rsv);
      if (score < 60) continue;
      const parts = [
        nameMatches(req.last_name, req.first_name, rsv.last_name, rsv.first_name)
          ? "名40"
          : null,
        contactMatches(req.email, req.phone, rsv.email, rsv.phone)
          ? "連40"
          : null,
        stayMatches(req.check_in, req.check_out, rsv.check_in, rsv.check_out)
          ? "日20"
          : null,
      ]
        .filter(Boolean)
        .join("+");
      if (!best || score > best.score) {
        best = { req, res: rsv, score, parts };
      }
    }
    if (best) review.push(best);
  }
  review.sort((a, b) => b.score - a.score);
  console.log(`\n重複レビュー候補 (score>=60): ${review.length}`);
  for (const c of review) {
    console.log(
      `  [${c.score} ${c.parts}] ${c.req.request_id} ↔ ${c.res.reservation_id}\n    RQ: ${brief(c.req)}\n    MT: ${brief(c.res)}`
    );
  }

  // --- name search ---
  const needles = ["鴇田", "平井", "小春"];
  console.log("\n=== 氏名キーワード検索 ===");
  for (const n of needles) {
    const rq = requests.filter(
      (r) =>
        (r.representative_name ?? "").includes(n) ||
        (r.last_name ?? "").includes(n) ||
        (r.first_name ?? "").includes(n)
    );
    const rs = reservations.filter(
      (r) =>
        (r.representative_name ?? "").includes(n) ||
        (r.last_name ?? "").includes(n) ||
        (r.first_name ?? "").includes(n)
    );
    console.log(`\n-- ${n} -- RQ=${rq.length} MT=${rs.length}`);
    for (const r of rq) {
      console.log(
        `  RQ ${r.request_id} linked=${r.linked_reservation_id ?? "—"} arch=${r.is_archived} ${brief(r)}`
      );
    }
    for (const r of rs) {
      console.log(
        `  MT ${r.reservation_id} request_id=${r.request_id ?? "—"} arch=${r.is_archived} ${brief(r)}`
      );
    }
  }

  // For each open unlinked, show nearest reservation by name (even if low score)
  console.log("\n=== 未連携オープン: 同姓同名 or 近い本予約の有無 ===");
  for (const req of openUnlinked) {
    const sameName = unlinkedReservations.filter((r) =>
      nameMatches(req.last_name, req.first_name, r.last_name, r.first_name)
    );
    const sameRep = unlinkedReservations.filter(
      (r) =>
        (r.representative_name ?? "").trim() &&
        (req.representative_name ?? "").trim() &&
        r.representative_name === req.representative_name
    );
    const contactHits = unlinkedReservations.filter((r) =>
      contactMatches(req.email, req.phone, r.email, r.phone)
    );
    const stayHits = unlinkedReservations.filter((r) =>
      stayMatches(req.check_in, req.check_out, r.check_in, r.check_out)
    );
    // also check linked reservations with same name (already linked to someone else)
    const linkedSameName = reservations.filter(
      (r) =>
        r.request_id &&
        nameMatches(req.last_name, req.first_name, r.last_name, r.first_name)
    );
    const scores = unlinkedReservations
      .map((r) => ({ r, score: requestReservationMatchScore(req, r) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    console.log(
      `\n${req.request_id} ${brief(req)}\n  sameNameUnlinked=${sameName.length} sameRep=${sameRep.length} contact=${contactHits.length} stay=${stayHits.length} linkedSameName=${linkedSameName.length}`
    );
    for (const s of scores) {
      console.log(`  best# ${s.score}: ${s.r.reservation_id} ${brief(s.r)}`);
    }
    if (linkedSameName.length) {
      for (const r of linkedSameName.slice(0, 3)) {
        console.log(
          `  already-linked same name: ${r.reservation_id} -> ${r.request_id} ${brief(r)}`
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
