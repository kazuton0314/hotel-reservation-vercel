import type { SupabaseClient } from "@supabase/supabase-js";
import { FORM_SOURCES } from "@/lib/config/forms";
import { backfillFormImportLog } from "@/lib/import/backfill-form-import-log";
import { syncSequencesFromLedger } from "@/lib/import/id-generation";
import {
  isRequestRowImportable,
  mapRequestFormRow,
  type RequestInsert,
} from "@/lib/import/request-mapper";
import { fetchSheetRows } from "@/lib/sheets/client";

const RQ_ID_PATTERN = /^STUDIO-RQ(\d+)$/;

export type DuplicateLoggedRequest = {
  requestId: string;
  rqNumber: number;
  sourceRows: number[];
  firstRow: number;
  duplicateRow: number;
};

export type RqNumberingShiftAudit = {
  duplicateLogs: DuplicateLoggedRequest[];
  selected: DuplicateLoggedRequest | null;
  shiftFromRq: number | null;
  currentMaxRq: number | null;
  expectedLatest: {
    lastName: string;
    firstName: string;
    expectedRq: number;
  };
  latestMatch: {
    requestId: string;
    rqNumber: number;
    lastName: string | null;
    firstName: string | null;
    importRowId: string | null;
  } | null;
  renames: Array<{ from: string; to: string }>;
  missingImport: {
    sheetRow: number;
    targetRequestId: string;
    representativeName: string | null;
  } | null;
  warnings: string[];
};

export type RecoverRqNumberingShiftResult = {
  dryRun: boolean;
  audit: RqNumberingShiftAudit;
  renumbered: number;
  insertedRequestId: string | null;
  sequenceAfter: number | null;
};

function parseRqNumber(requestId: string): number | null {
  const match = requestId.match(RQ_ID_PATTERN);
  if (!match) return null;
  return parseInt(match[1], 10);
}

function formatRqId(num: number): string {
  return `STUDIO-RQ${num}`;
}

export async function findDuplicateLoggedRequests(
  supabase: SupabaseClient
): Promise<DuplicateLoggedRequest[]> {
  const { data, error } = await supabase
    .from("form_import_log")
    .select("source_row, request_id")
    .eq("source", "request")
    .order("source_row", { ascending: true });
  if (error) throw error;

  const byRequestId = new Map<string, number[]>();
  for (const row of data ?? []) {
    const requestId = String(row.request_id ?? "").trim();
    const sourceRow = Number(row.source_row);
    if (!requestId || !Number.isFinite(sourceRow)) continue;
    const list = byRequestId.get(requestId) ?? [];
    list.push(sourceRow);
    byRequestId.set(requestId, list);
  }

  return [...byRequestId.entries()]
    .map(([requestId, sourceRows]) => {
      const sorted = [...sourceRows].sort((a, b) => a - b);
      const rqNumber = parseRqNumber(requestId);
      if (sorted.length < 2 || rqNumber == null) return null;
      return {
        requestId,
        rqNumber,
        sourceRows: sorted,
        firstRow: sorted[0],
        duplicateRow: sorted[sorted.length - 1],
      };
    })
    .filter((row): row is DuplicateLoggedRequest => row != null)
    .sort((a, b) => a.firstRow - b.firstRow);
}

async function loadCurrentMaxRq(
  supabase: SupabaseClient
): Promise<number | null> {
  const { data, error } = await supabase
    .from("reservation_requests")
    .select("request_id")
    .like("request_id", "STUDIO-RQ%");
  if (error) throw error;

  let max: number | null = null;
  for (const row of data ?? []) {
    const num = parseRqNumber(String(row.request_id ?? ""));
    if (num != null) max = max == null ? num : Math.max(max, num);
  }
  return max;
}

async function findLatestRequestByName(
  supabase: SupabaseClient,
  lastName: string,
  firstName: string
) {
  const { data, error } = await supabase
    .from("reservation_requests")
    .select("request_id, last_name, first_name, import_row_id")
    .eq("last_name", lastName)
    .eq("first_name", firstName)
    .like("request_id", "STUDIO-RQ%")
    .order("request_id", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  const rqNumber = parseRqNumber(String(row.request_id ?? ""));
  if (rqNumber == null) return null;
  return {
    requestId: String(row.request_id),
    rqNumber,
    lastName: row.last_name as string | null,
    firstName: row.first_name as string | null,
    importRowId: row.import_row_id as string | null,
  };
}

function readNameFromSheetRow(
  headers: string[],
  values: unknown[]
): { lastName: string | null; firstName: string | null; representativeName: string | null } {
  const idx = Object.fromEntries(headers.map((h, i) => [h.trim(), i]));
  const pick = (key: string) => {
    const i = idx[key];
    if (i === undefined) return "";
    return String(values[i] ?? "").trim();
  };
  const lastName = pick("姓");
  const firstName = pick("名");
  const representativeName =
    pick("代表者名") || [lastName, firstName].filter(Boolean).join(" ").trim() || null;
  return {
    lastName: lastName || null,
    firstName: firstName || null,
    representativeName,
  };
}

export async function auditRqNumberingShift(
  supabase: SupabaseClient,
  options: {
    duplicateRow?: number;
    expectedLatest?: { lastName: string; firstName: string; expectedRq: number };
  } = {}
): Promise<RqNumberingShiftAudit> {
  const expectedLatest = options.expectedLatest ?? {
    lastName: "河合",
    firstName: "怜治",
    expectedRq: 68,
  };

  const duplicateLogs = await findDuplicateLoggedRequests(supabase);
  const selected =
    (options.duplicateRow != null
      ? duplicateLogs.find((d) => d.duplicateRow === options.duplicateRow)
      : null) ?? duplicateLogs[0] ?? null;

  const currentMaxRq = await loadCurrentMaxRq(supabase);
  const latestMatch = await findLatestRequestByName(
    supabase,
    expectedLatest.lastName,
    expectedLatest.firstName
  );

  const warnings: string[] = [];
  const shiftFromRq = selected ? selected.rqNumber + 1 : null;
  const renames: Array<{ from: string; to: string }> = [];

  if (selected && shiftFromRq != null && currentMaxRq != null) {
    for (let n = currentMaxRq; n >= shiftFromRq; n--) {
      renames.push({ from: formatRqId(n), to: formatRqId(n + 1) });
    }
  }

  let missingImport: RqNumberingShiftAudit["missingImport"] = null;
  if (selected && shiftFromRq != null) {
    missingImport = {
      sheetRow: selected.duplicateRow,
      targetRequestId: formatRqId(shiftFromRq),
      representativeName: null,
    };
    try {
      const cfg = FORM_SOURCES.request;
      const { headers, rows } = await fetchSheetRows(
        cfg.spreadsheetId,
        cfg.sheetName,
        cfg.dataColumnCount
      );
      const sheetRow = rows.find((r) => r.sheetRow === selected.duplicateRow);
      if (sheetRow) {
        const name = readNameFromSheetRow(headers, sheetRow.values);
        missingImport.representativeName = name.representativeName;
      }
    } catch (e) {
      warnings.push(
        `スプシ確認スキップ: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  if (!selected) {
    warnings.push("form_import_log で同一 request_id に複数 source_row は見つかりませんでした。");
  }
  if (latestMatch && latestMatch.rqNumber !== expectedLatest.expectedRq) {
    warnings.push(
      `${expectedLatest.lastName} ${expectedLatest.firstName} は現在 ${latestMatch.requestId} です（期待 ${formatRqId(expectedLatest.expectedRq)}）。`
    );
  }
  if (
    selected &&
    currentMaxRq != null &&
    latestMatch &&
    latestMatch.rqNumber + 1 !== expectedLatest.expectedRq &&
    currentMaxRq + 1 !== expectedLatest.expectedRq
  ) {
    warnings.push(
      `現在最大 RQ${currentMaxRq} → 修正後 RQ${currentMaxRq + 1} を期待しましたが、検証名は ${formatRqId(expectedLatest.expectedRq)} 指定です。`
    );
  }

  return {
    duplicateLogs,
    selected,
    shiftFromRq,
    currentMaxRq,
    expectedLatest,
    latestMatch,
    renames,
    missingImport,
    warnings,
  };
}

async function renameRequestIdEverywhere(
  supabase: SupabaseClient,
  fromId: string,
  toId: string
): Promise<void> {
  const { data: existing, error } = await supabase
    .from("reservation_requests")
    .select("*")
    .eq("request_id", fromId)
    .maybeSingle();
  if (error) throw error;
  if (!existing) throw new Error(`リクエスト ${fromId} が見つかりません`);

  const { data: conflict } = await supabase
    .from("reservation_requests")
    .select("request_id")
    .eq("request_id", toId)
    .maybeSingle();
  if (conflict) throw new Error(`${toId} が既に存在するため ${fromId} をリネームできません`);

  const nowIso = new Date().toISOString();
  const { request_id: _old, ...rest } = existing as Record<string, unknown> & {
    request_id: string;
  };

  const { error: insError } = await supabase.from("reservation_requests").insert({
    ...rest,
    request_id: toId,
    updated_at: nowIso,
  });
  if (insError) throw insError;

  const { error: resError } = await supabase
    .from("reservations")
    .update({ request_id: toId, updated_at: nowIso })
    .eq("request_id", fromId);
  if (resError) throw resError;

  const { error: logError } = await supabase
    .from("form_import_log")
    .update({ request_id: toId, imported_at: nowIso })
    .eq("request_id", fromId);
  if (logError) throw logError;

  const { error: mailError } = await supabase
    .from("mail_logs")
    .update({ entity_id: toId })
    .eq("entity_type", "request")
    .eq("entity_id", fromId);
  if (mailError) {
    console.warn(`  warn: mail_logs update failed ${fromId}→${toId}: ${mailError.message}`);
  }

  const { error: delError } = await supabase
    .from("reservation_requests")
    .delete()
    .eq("request_id", fromId);
  if (delError) throw delError;
}

async function importRequestFromSheetRow(
  supabase: SupabaseClient,
  sheetRow: number,
  requestId: string
): Promise<RequestInsert> {
  const cfg = FORM_SOURCES.request;
  const { headers, rows } = await fetchSheetRows(
    cfg.spreadsheetId,
    cfg.sheetName,
    cfg.dataColumnCount
  );
  const row = rows.find((r) => r.sheetRow === sheetRow);
  if (!row) throw new Error(`スプシ行 ${sheetRow} が見つかりません`);
  if (!isRequestRowImportable(row, headers)) {
    throw new Error(`スプシ行 ${sheetRow} は取込不可です`);
  }

  const mapped = mapRequestFormRow(row, headers, requestId, new Date(), {
    validateBookingHorizon: false,
  });
  const record: RequestInsert = {
    ...mapped,
    request_id: requestId,
    import_row_id: String(sheetRow),
  };

  const { error } = await supabase.from("reservation_requests").insert(record);
  if (error) throw error;

  const { error: logError } = await supabase.from("form_import_log").upsert(
    {
      source: "request",
      source_row: sheetRow,
      request_id: requestId,
    },
    { onConflict: "source,source_row" }
  );
  if (logError) throw logError;

  return record;
}

export async function recoverRqNumberingShift(
  supabase: SupabaseClient,
  options: {
    dryRun?: boolean;
    duplicateRow?: number;
    expectedLatest?: { lastName: string; firstName: string; expectedRq: number };
  } = {}
): Promise<RecoverRqNumberingShiftResult> {
  const dryRun = options.dryRun !== false;
  const audit = await auditRqNumberingShift(supabase, options);

  if (!audit.selected || audit.shiftFromRq == null || audit.currentMaxRq == null) {
    throw new Error("復旧対象の重複ログが特定できませんでした。");
  }

  const selected = audit.selected;
  const shiftFrom = audit.shiftFromRq;
  const maxRq = audit.currentMaxRq;
  const tempPrefix = "__TMP_RQ_SHIFT__";

  if (!dryRun) {
    console.log(
      `[1/4] RQ${shiftFrom}..RQ${maxRq} を +1 シフト (${selected.requestId} 重複の穴埋め)`
    );

    for (let n = maxRq; n >= shiftFrom; n--) {
      const fromId = formatRqId(n);
      const tempId = `${tempPrefix}${fromId}`;
      console.log(`  temp ${fromId} → ${tempId}`);
      await renameRequestIdEverywhere(supabase, fromId, tempId);
    }

    for (let n = shiftFrom; n <= maxRq; n++) {
      const tempId = `${tempPrefix}${formatRqId(n)}`;
      const toId = formatRqId(n + 1);
      console.log(`  final ${tempId} → ${toId}`);
      await renameRequestIdEverywhere(supabase, tempId, toId);
    }

    console.log(
      `[2/4] 未取込行 ${selected.duplicateRow} を ${formatRqId(shiftFrom)} として投入`
    );
    await importRequestFromSheetRow(
      supabase,
      selected.duplicateRow,
      formatRqId(shiftFrom)
    );

    console.log(`[3/4] form_import_log 再整合`);
    await supabase.from("form_import_log").upsert(
      {
        source: "request",
        source_row: selected.firstRow,
        request_id: selected.requestId,
      },
      { onConflict: "source,source_row" }
    );

    console.log(`[4/4] backfill + 採番同期`);
    await backfillFormImportLog(supabase);
    await syncSequencesFromLedger(supabase);
  }

  let sequenceAfter: number | null = null;
  if (!dryRun) {
    const { data: seq } = await supabase
      .from("import_sequences")
      .select("current_value")
      .eq("key", "studio_rq")
      .maybeSingle();
    sequenceAfter = seq?.current_value ?? null;
  }

  if (!dryRun) {
    const verify = await findLatestRequestByName(
      supabase,
      audit.expectedLatest.lastName,
      audit.expectedLatest.firstName
    );
    if (
      verify &&
      verify.rqNumber !== audit.expectedLatest.expectedRq
    ) {
      throw new Error(
        `復旧後検証失敗: ${verify.requestId} (${audit.expectedLatest.lastName} ${audit.expectedLatest.firstName})`
      );
    }
  }

  return {
    dryRun,
    audit,
    renumbered: audit.renames.length,
    insertedRequestId: dryRun ? formatRqId(shiftFrom) : formatRqId(shiftFrom),
    sequenceAfter,
  };
}
