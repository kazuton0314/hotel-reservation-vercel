import type { SupabaseClient } from "@supabase/supabase-js";
import { findDuplicateLoggedRequests } from "@/lib/import/recover-rq-numbering-shift";

const RQ_PATTERN = /^STUDIO-RQ(\d+)$/;

function parseRq(id: string): number | null {
  const m = id.match(RQ_PATTERN);
  return m ? parseInt(m[1], 10) : null;
}

export type RqRecoveryAuditIssue = {
  severity: "error" | "warn" | "info";
  code: string;
  message: string;
  detail?: string;
};

export type RqRecoveryAuditReport = {
  ok: boolean;
  issues: RqRecoveryAuditIssue[];
  stats: {
    requestCount: number;
    reservationWithRequestCount: number;
    maxRq: number | null;
    sequenceRq: number | null;
    nextRqWouldBe: number | null;
    duplicateLogCount: number;
    tmpIdCount: number;
    brokenReservationLinks: number;
    brokenRequestLinks: number;
    mismatchedBidirectional: number;
    orphanMailLogs: number;
  };
  samples: {
    konoMizuki: Array<{
      requestId: string;
      importRowId: string | null;
      linkedReservationId: string | null;
    }>;
    kawaiReiji: {
      requestId: string;
      importRowId: string | null;
      linkedReservationId: string | null;
      reservationRequestId: string | null;
    } | null;
    shiftedRange59to68: Array<{
      requestId: string;
      name: string;
      importRowId: string | null;
      linkedReservationId: string | null;
      reservationId: string | null;
      reservationName: string | null;
    }>;
  };
};

export async function auditRqRecoveryIntegrity(
  supabase: SupabaseClient
): Promise<RqRecoveryAuditReport> {
  const issues: RqRecoveryAuditIssue[] = [];

  const [
    { data: requests, error: reqErr },
    { data: reservations, error: resErr },
    { data: seqRow, error: seqErr },
    { data: mailLogs, error: mailErr },
  ] = await Promise.all([
    supabase
      .from("reservation_requests")
      .select(
        "request_id, last_name, first_name, import_row_id, linked_reservation_id, status"
      )
      .like("request_id", "STUDIO-RQ%"),
    supabase
      .from("reservations")
      .select(
        "reservation_id, request_id, last_name, first_name, status, import_source"
      )
      .not("request_id", "is", null),
    supabase
      .from("import_sequences")
      .select("current_value")
      .eq("key", "studio_rq")
      .maybeSingle(),
    supabase
      .from("mail_logs")
      .select("entity_id")
      .eq("entity_type", "request"),
  ]);

  if (reqErr) throw reqErr;
  if (resErr) throw resErr;
  if (seqErr) throw seqErr;
  if (mailErr) throw mailErr;

  const requestRows = requests ?? [];
  const reservationRows = reservations ?? [];
  const requestById = new Map(
    requestRows.map((r) => [String(r.request_id), r])
  );
  const reservationById = new Map(
    reservationRows.map((r) => [String(r.reservation_id), r])
  );
  const reservationByRequestId = new Map<string, typeof reservationRows>();
  for (const r of reservationRows) {
    const rq = String(r.request_id ?? "").trim();
    if (!rq) continue;
    const list = reservationByRequestId.get(rq) ?? [];
    list.push(r);
    reservationByRequestId.set(rq, list);
  }

  let maxRq: number | null = null;
  for (const r of requestRows) {
    const n = parseRq(String(r.request_id));
    if (n != null) maxRq = maxRq == null ? n : Math.max(maxRq, n);
  }

  const sequenceRq = seqRow?.current_value ?? null;
  const nextRqWouldBe =
    maxRq != null ? Math.max(maxRq, sequenceRq ?? 0) + 1 : null;

  const duplicateLogs = await findDuplicateLoggedRequests(supabase);
  if (duplicateLogs.length) {
    for (const d of duplicateLogs) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_IMPORT_LOG",
        message: `${d.requestId} に複数 source_row (${d.sourceRows.join(", ")})`,
      });
    }
  }

  const tmpRequests = requestRows.filter((r) =>
    String(r.request_id).includes("__TMP_RQ_SHIFT__")
  );
  if (tmpRequests.length) {
    issues.push({
      severity: "error",
      code: "TMP_IDS_REMAIN",
      message: `復旧用一時 ID が ${tmpRequests.length} 件残存`,
      detail: tmpRequests.map((r) => r.request_id).join(", "),
    });
  }

  if (sequenceRq != null && maxRq != null && sequenceRq !== maxRq) {
    issues.push({
      severity: "error",
      code: "SEQUENCE_MISMATCH",
      message: `import_sequences.studio_rq=${sequenceRq} だが台帳最大は RQ${maxRq}`,
    });
  }

  let brokenReservationLinks = 0;
  for (const r of reservationRows) {
    const rq = String(r.request_id ?? "").trim();
    if (!rq || !RQ_PATTERN.test(rq)) continue;
    if (!requestById.has(rq)) {
      brokenReservationLinks++;
      issues.push({
        severity: "error",
        code: "ORPHAN_RESERVATION_REQUEST_ID",
        message: `${r.reservation_id} の request_id=${rq} が reservation_requests に存在しない`,
      });
    }
  }

  let brokenRequestLinks = 0;
  for (const r of requestRows) {
    const mt = r.linked_reservation_id as string | null;
    if (!mt) continue;
    if (!reservationById.has(mt)) {
      brokenRequestLinks++;
      issues.push({
        severity: "error",
        code: "BROKEN_LINKED_RESERVATION",
        message: `${r.request_id} の linked_reservation_id=${mt} が reservations に存在しない`,
      });
    }
  }

  let mismatchedBidirectional = 0;
  for (const req of requestRows) {
    const rq = String(req.request_id);
    const linked = req.linked_reservation_id as string | null;
    if (!linked) continue;
    const res = reservationById.get(linked);
    if (!res) continue;
    const resRq = String(res.request_id ?? "").trim();
    if (resRq && resRq !== rq) {
      mismatchedBidirectional++;
      issues.push({
        severity: "error",
        code: "BIDIRECTIONAL_MISMATCH",
        message: `RQ ${rq} ↔ MT ${linked}: 予約側 request_id=${resRq || "(null)"}`,
      });
    }
  }

  for (const [rq, linkedReservations] of reservationByRequestId) {
    if (!requestById.has(rq)) continue;
    const req = requestById.get(rq)!;
    const linked = req.linked_reservation_id as string | null;
    if (linkedReservations.length > 1) {
      issues.push({
        severity: "warn",
        code: "MULTIPLE_RESERVATIONS_PER_REQUEST",
        message: `${rq} に紐づく本予約が ${linkedReservations.length} 件`,
        detail: linkedReservations.map((r) => r.reservation_id).join(", "),
      });
    }
    if (linked && !linkedReservations.some((r) => r.reservation_id === linked)) {
      issues.push({
        severity: "warn",
        code: "LINKED_MT_NOT_POINTING_BACK",
        message: `${rq}.linked_reservation_id=${linked} だが reservations.request_id=${rq} の MT が一致しない`,
      });
    }
  }

  const requestIds = new Set(requestRows.map((r) => String(r.request_id)));
  let orphanMailLogs = 0;
  for (const row of mailLogs ?? []) {
    const id = String(row.entity_id ?? "");
    if (id.startsWith("STUDIO-RQ") && !requestIds.has(id)) {
      orphanMailLogs++;
    }
  }
  if (orphanMailLogs) {
    issues.push({
      severity: "warn",
      code: "ORPHAN_MAIL_LOGS",
      message: `mail_logs に存在しない request_id が ${orphanMailLogs} 件`,
    });
  }

  const konoMizuki = requestRows
    .filter((r) => r.last_name === "鴻野" && r.first_name === "美月")
    .map((r) => ({
      requestId: String(r.request_id),
      importRowId: r.import_row_id as string | null,
      linkedReservationId: r.linked_reservation_id as string | null,
    }));

  if (konoMizuki.length !== 2) {
    issues.push({
      severity: "error",
      code: "KONO_COUNT",
      message: `鴻野 美月 の RQ は ${konoMizuki.length} 件（期待 2 件）`,
      detail: konoMizuki.map((k) => k.requestId).join(", "),
    });
  } else {
    const nums = konoMizuki.map((k) => parseRq(k.requestId)).filter((n) => n != null);
    if (!nums.includes(58) || !nums.includes(59)) {
      issues.push({
        severity: "error",
        code: "KONO_IDS",
        message: `鴻野 美月 は RQ58/RQ59 であるべき: ${konoMizuki.map((k) => k.requestId).join(", ")}`,
      });
    }
  }

  const kawaiRow = requestRows.find(
    (r) => r.last_name === "河合" && r.first_name === "怜治"
  );
  const kawaiReiji = kawaiRow
    ? {
        requestId: String(kawaiRow.request_id),
        importRowId: kawaiRow.import_row_id as string | null,
        linkedReservationId: kawaiRow.linked_reservation_id as string | null,
        reservationRequestId:
          (kawaiRow.linked_reservation_id
            ? reservationById.get(String(kawaiRow.linked_reservation_id))
                ?.request_id
            : reservationByRequestId.get(String(kawaiRow.request_id))?.[0]
                ?.request_id) ?? null,
      }
    : null;

  if (!kawaiReiji || parseRq(kawaiReiji.requestId) !== 68) {
    issues.push({
      severity: "error",
      code: "KAWAI_RQ68",
      message: `河合 怜治 は STUDIO-RQ68 であるべき（現在 ${kawaiReiji?.requestId ?? "なし"}）`,
    });
  }

  const shiftedRange59to68 = requestRows
    .filter((r) => {
      const n = parseRq(String(r.request_id));
      return n != null && n >= 59 && n <= 68;
    })
    .sort(
      (a, b) =>
        (parseRq(String(a.request_id)) ?? 0) -
        (parseRq(String(b.request_id)) ?? 0)
    )
    .map((r) => {
      const rq = String(r.request_id);
      const linked = r.linked_reservation_id as string | null;
      const res =
        linked != null
          ? reservationById.get(linked)
          : reservationByRequestId.get(rq)?.[0];
      return {
        requestId: rq,
        name: `${r.last_name ?? ""} ${r.first_name ?? ""}`.trim(),
        importRowId: r.import_row_id as string | null,
        linkedReservationId: linked,
        reservationId: res ? String(res.reservation_id) : null,
        reservationName: res
          ? `${res.last_name ?? ""} ${res.first_name ?? ""}`.trim()
          : null,
      };
    });

  if (shiftedRange59to68.length !== 10) {
    issues.push({
      severity: "warn",
      code: "SHIFTED_RANGE_COUNT",
      message: `RQ59–68 は 10 件のはずが ${shiftedRange59to68.length} 件`,
    });
  }

  const errors = issues.filter((i) => i.severity === "error");

  return {
    ok: errors.length === 0,
    issues,
    stats: {
      requestCount: requestRows.length,
      reservationWithRequestCount: reservationRows.filter((r) =>
        RQ_PATTERN.test(String(r.request_id ?? ""))
      ).length,
      maxRq,
      sequenceRq,
      nextRqWouldBe,
      duplicateLogCount: duplicateLogs.length,
      tmpIdCount: tmpRequests.length,
      brokenReservationLinks,
      brokenRequestLinks,
      mismatchedBidirectional,
      orphanMailLogs,
    },
    samples: {
      konoMizuki,
      kawaiReiji,
      shiftedRange59to68,
    },
  };
}
