import type { SupabaseClient } from "@supabase/supabase-js";
import { FORM_SOURCES } from "@/lib/config/forms";
import {
  findRequestByImportRowId,
  findReservationByImportRowId,
  isPastImportSource,
  loadAllRequestsForImport,
  loadAllReservationsForImport,
  logRequestFormImport,
  logStudioFormImport,
  type RequestImportRecord,
  type ReservationImportRecord,
} from "@/lib/import/form-import-index";
import {
  nextStudioRequestId,
  nextStudioReservationId,
} from "@/lib/import/id-generation";
import {
  bookingEntryMatchesForLink,
  isRequestAvailableForAutoLink,
} from "@/lib/import/match-utils";
import { linkExistingRequestsAndReservations } from "@/lib/import/post-link";
import {
  isRequestRowImportable,
  mapRequestFormRow,
  type RequestInsert,
} from "@/lib/import/request-mapper";
import {
  isStudioRowImportable,
  mapStudioFormRow,
  readStudioSomen,
} from "@/lib/import/reservation-mapper";
import type { ReservationInsert } from "@/lib/import/reservation-mapper";
import { syncReservationToGCal } from "@/lib/services/gcal-sync";
import { fetchSheetRows } from "@/lib/sheets/client";
import type { SheetRow } from "@/lib/sheets/client";

/** 仮予約上書き時に残す運用系フィールド（フォーム値で潰さない） */
const PROVISIONAL_PRESERVE_SELECT =
  "gcal_event_id, internal_memo, guest_memo, assignment_status, companion_form_answered, completion_email_sent, completion_email_sent_at, day11_email_sent, day11_email_sent_at, day3_email_sent, day3_email_sent_at, customer_id, payment_method, payment_status";

export type ImportResult = {
  imported: number;
  skipped: number;
  skippedAlreadyLogged: number;
  skippedAlreadyInDb: number;
  skippedNotImportable: number;
  errors: string[];
  totalRows: number;
};

export type ImportFormRowsOptions = {
  /** form_import_log に載っていても再取込する（CSVテスト向け） */
  force?: boolean;
};

type ActiveReservation = ReservationImportRecord;

/** source_row → 紐付いた reservation_id / request_id */
type ImportLogMap = Map<number, string>;

function isFormSyncPaused(): boolean {
  return process.env.FORM_SYNC_DISABLED === "true";
}

export function assertFormSyncEnabled() {
  if (isFormSyncPaused()) {
    throw new Error(
      "フォーム同期は一時停止中です（FORM_SYNC_DISABLED=true）。復旧完了後に解除してください。"
    );
  }
}

async function loadImportLogMap(
  supabase: SupabaseClient,
  source: "studio" | "request"
): Promise<ImportLogMap> {
  const map: ImportLogMap = new Map();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("form_import_log")
      .select("source_row, reservation_id, request_id")
      .eq("source", source)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      const id =
        source === "studio"
          ? (row.reservation_id as string | null)
          : (row.request_id as string | null);
      if (row.source_row != null && id) {
        map.set(Number(row.source_row), id);
      }
    }
    if (rows.length < pageSize) break;
  }
  return map;
}

async function loadActiveReservationsForMatching(
  supabase: SupabaseClient
): Promise<ActiveReservation[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "reservation_id, import_row_id, import_source, access_key, status, check_in, check_out, last_name, first_name, email, phone, request_id, is_archived"
    )
    .eq("is_archived", false);
  if (error) throw error;
  return (data ?? []) as ActiveReservation[];
}

async function loadActiveRequestsForMatching(
  supabase: SupabaseClient
): Promise<RequestImportRecord[]> {
  const { data, error } = await supabase
    .from("reservation_requests")
    .select(
      "request_id, import_row_id, access_key, status, check_in, check_out, last_name, first_name, email, phone, linked_reservation_id, reject_reason, internal_memo, reply_email_sent, reply_email_sent_at, sheet_created_at, is_archived"
    )
    .eq("is_archived", false);
  if (error) throw error;
  return (data ?? []) as RequestImportRecord[];
}

function findMatchingProvisionalReservation(
  reservations: ActiveReservation[],
  record: ReservationInsert
) {
  return reservations.find((r) => {
    if (r.status !== "仮予約") return false;
    return bookingEntryMatchesForLink(r, record);
  });
}

function findMatchingRequestForStudio(
  requests: RequestImportRecord[],
  record: ReservationInsert
) {
  return requests.find((req) => {
    if (!isRequestAvailableForAutoLink(req.status, req.linked_reservation_id)) {
      return false;
    }
    return bookingEntryMatchesForLink(req, record);
  });
}

function pushRequestCache(requests: RequestImportRecord[], record: RequestInsert) {
  requests.push({
    request_id: record.request_id,
    import_row_id: record.import_row_id,
    access_key: record.access_key,
    status: record.status,
    check_in: record.check_in,
    check_out: record.check_out,
    last_name: record.last_name,
    first_name: record.first_name,
    email: record.email,
    phone: record.phone,
    linked_reservation_id: null,
    reject_reason: null,
    internal_memo: null,
    reply_email_sent: false,
    reply_email_sent_at: null,
    sheet_created_at: record.sheet_created_at,
    is_archived: false,
  });
}

async function startSyncRun(supabase: SupabaseClient, jobName: string) {
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({ job_name: jobName, status: "running" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function finishSyncRun(
  supabase: SupabaseClient,
  runId: string,
  payload: {
    status: "success" | "error";
    rows_read?: number;
    rows_imported?: number;
    rows_skipped?: number;
    error_message?: string;
    details?: Record<string, unknown>;
  }
) {
  await supabase
    .from("sync_runs")
    .update({
      finished_at: new Date().toISOString(),
      ...payload,
    })
    .eq("id", runId);
}

export async function importRequestFormRows(
  supabase: SupabaseClient,
  headers: string[],
  rows: SheetRow[],
  options: ImportFormRowsOptions = {}
): Promise<ImportResult> {
  const importLog = await loadImportLogMap(supabase, "request");
  const now = new Date();
  let imported = 0;
  let skippedAlreadyLogged = 0;
  let skippedAlreadyInDb = 0;
  let skippedNotImportable = 0;
  const errors: string[] = [];
  const requests = await loadAllRequestsForImport(supabase);

  for (const row of rows) {
    // form_import_log に行番号があればスキップ（内容不一致でも再取込しない）
    if (!options.force && importLog.has(row.sheetRow)) {
      skippedAlreadyLogged++;
      continue;
    }
    if (!isRequestRowImportable(row, headers)) {
      skippedNotImportable++;
      continue;
    }

    try {
      const existingByRow = findRequestByImportRowId(requests, row.sheetRow);
      if (existingByRow) {
        await logRequestFormImport(
          supabase,
          row.sheetRow,
          existingByRow.request_id
        );
        skippedAlreadyInDb++;
        continue;
      }

      const draftId = `DRAFT-${row.sheetRow}`;
      const incoming = mapRequestFormRow(row, headers, draftId, now, {
        validateBookingHorizon: false,
      });

      // スプシ行ごとに独立した RQ を採番する（同一人物・同一内容の再送も別 RQ）。
      // 再取込判定は form_import_log / import_row_id のみで行う。
      const requestId = await nextStudioRequestId(supabase);
      const record: RequestInsert = {
        ...incoming,
        request_id: requestId,
        import_row_id: String(row.sheetRow),
      };

      const { error: upsertError } = await supabase
        .from("reservation_requests")
        .upsert(record, { onConflict: "request_id" });
      if (upsertError) throw upsertError;

      await logRequestFormImport(supabase, row.sheetRow, requestId);

      pushRequestCache(requests, record);
      importLog.set(row.sheetRow, requestId);
      imported++;
    } catch (e) {
      errors.push(`行${row.sheetRow}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    imported,
    skipped: skippedAlreadyLogged + skippedAlreadyInDb + skippedNotImportable,
    skippedAlreadyLogged,
    skippedAlreadyInDb,
    skippedNotImportable,
    errors,
    totalRows: rows.length,
  };
}

export async function importRequestForms(
  supabase: SupabaseClient
): Promise<ImportResult> {
  const cfg = FORM_SOURCES.request;
  const { headers, rows } = await fetchSheetRows(
    cfg.spreadsheetId,
    cfg.sheetName,
    cfg.dataColumnCount
  );

  return importRequestFormRows(supabase, headers, rows);
}

/**
 * 取込済み行は再upsertしない方針のまま、空の流しそうめんだけシートから埋める。
 * 列追加後に取り込まれた予約（青木和佐など）が null のまま残るのを防ぐ。
 */
export async function fillEmptyStudioSomenFromSheet(
  supabase: SupabaseClient,
  headers: string[],
  rows: SheetRow[],
  importLog: ImportLogMap,
  allReservations: ReservationImportRecord[]
): Promise<string[]> {
  const wanted = new Map<string, string>();
  for (const row of rows) {
    const somen = readStudioSomen(headers, row.values);
    if (!somen) continue;
    const loggedId = importLog.get(row.sheetRow);
    const byRow = findReservationByImportRowId(allReservations, row.sheetRow);
    const reservationId = String(loggedId || byRow?.reservation_id || "").trim();
    if (!reservationId || reservationId.startsWith("PAST-")) continue;
    if (isPastImportSource(byRow?.import_source)) continue;
    wanted.set(reservationId, somen);
  }
  if (!wanted.size) return [];

  const ids = [...wanted.keys()];
  const { data: existing, error } = await supabase
    .from("reservations")
    .select("reservation_id, somen")
    .in("reservation_id", ids);
  if (error) return [];

  const emptyIds = new Set(
    (existing ?? [])
      .filter((row) => !String(row.somen ?? "").trim())
      .map((row) => String(row.reservation_id))
  );
  const filled: string[] = [];
  const nowIso = new Date().toISOString();
  for (const [reservationId, somen] of wanted) {
    if (!emptyIds.has(reservationId)) continue;
    const { error: updateError } = await supabase
      .from("reservations")
      .update({ somen, updated_at: nowIso })
      .eq("reservation_id", reservationId);
    if (!updateError) filled.push(reservationId);
  }
  return filled;
}

export async function importStudioFormRows(
  supabase: SupabaseClient,
  headers: string[],
  rows: SheetRow[],
  options: ImportFormRowsOptions = {}
): Promise<ImportResult> {
  const importLog = await loadImportLogMap(supabase, "studio");
  const now = new Date();
  let imported = 0;
  let skippedAlreadyLogged = 0;
  let skippedAlreadyInDb = 0;
  let skippedNotImportable = 0;
  const errors: string[] = [];
  const pendingGCalIds: string[] = [];
  const allReservations = await loadAllReservationsForImport(supabase);
  const activeReservations = await loadActiveReservationsForMatching(supabase);
  const activeRequests = await loadActiveRequestsForMatching(supabase);

  for (const row of rows) {
    // form_import_log に行番号があればスキップ（内容不一致でも再取込しない）
    // ただし PAST-* への誤紐づけは過去取込との行番号衝突なので無視する
    if (!options.force && importLog.has(row.sheetRow)) {
      const loggedId = importLog.get(row.sheetRow);
      if (!String(loggedId ?? "").startsWith("PAST-")) {
        skippedAlreadyLogged++;
        continue;
      }
    }
    if (!isStudioRowImportable(row, headers)) {
      skippedNotImportable++;
      continue;
    }

    try {
      const existingByRow = findReservationByImportRowId(
        allReservations,
        row.sheetRow
      );
      if (existingByRow) {
        await logStudioFormImport(
          supabase,
          row.sheetRow,
          existingByRow.reservation_id
        );
        skippedAlreadyInDb++;
        continue;
      }

      const draftId = `DRAFT-${row.sheetRow}`;
      const incoming = mapStudioFormRow(row, headers, draftId, now, {
        validateBookingHorizon: false,
      });

      let record: ReservationInsert = {
        ...incoming,
        import_row_id: String(row.sheetRow),
      };

      // 仮予約マッチ時は MT を新規採番して確定化し、旧仮予約 ID から置き換える
      // （最終的に STUDIO-MT* を正とし、仮予約 ID を残さない）
      const matchedProvisional = findMatchingProvisionalReservation(
        activeReservations,
        record
      );
      if (matchedProvisional) {
        const { data: provisionalRow } = await supabase
          .from("reservations")
          .select(PROVISIONAL_PRESERVE_SELECT)
          .eq("reservation_id", matchedProvisional.reservation_id)
          .maybeSingle();
        record = {
          ...record,
          access_key: matchedProvisional.access_key || record.access_key,
          request_id: matchedProvisional.request_id || null,
          gcal_event_id: provisionalRow?.gcal_event_id ?? null,
          internal_memo: provisionalRow?.internal_memo ?? null,
          guest_memo: provisionalRow?.guest_memo ?? null,
          assignment_status:
            provisionalRow?.assignment_status ?? record.assignment_status,
          companion_form_answered:
            provisionalRow?.companion_form_answered ?? false,
          completion_email_sent:
            provisionalRow?.completion_email_sent ?? false,
          completion_email_sent_at:
            provisionalRow?.completion_email_sent_at ?? null,
          day11_email_sent: provisionalRow?.day11_email_sent ?? false,
          day11_email_sent_at: provisionalRow?.day11_email_sent_at ?? null,
          day3_email_sent: provisionalRow?.day3_email_sent ?? false,
          day3_email_sent_at: provisionalRow?.day3_email_sent_at ?? null,
          customer_id: provisionalRow?.customer_id ?? null,
          payment_method:
            provisionalRow?.payment_method ?? record.payment_method,
          payment_status:
            provisionalRow?.payment_status ?? record.payment_status,
        };
      }

      const matchedRequest = findMatchingRequestForStudio(activeRequests, record);
      if (matchedRequest) {
        record = {
          ...record,
          request_id: matchedRequest.request_id,
          access_key: matchedRequest.access_key || record.access_key,
        };
      }

      const reservationId = await nextStudioReservationId(supabase);
      record = { ...record, reservation_id: reservationId };

      const { error: upsertError } = await supabase.from("reservations").upsert(
        {
          ...record,
          status: "確定",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "reservation_id" }
      );
      if (upsertError) throw upsertError;

      pendingGCalIds.push(record.reservation_id);

      if (matchedProvisional) {
        const provisionalId = matchedProvisional.reservation_id;
        const replacementId = record.reservation_id;
        const nowIso = new Date().toISOString();
        const { error: roomRelinkError } = await supabase
          .from("room_assignments")
          .update({ reservation_id: replacementId })
          .eq("reservation_id", provisionalId);
        if (roomRelinkError) throw roomRelinkError;
        const { error: companionRelinkError } = await supabase
          .from("companions")
          .update({ reservation_id: replacementId })
          .eq("reservation_id", provisionalId);
        if (companionRelinkError) throw companionRelinkError;
        const { error: requestRelinkError } = await supabase
          .from("reservation_requests")
          .update({
            linked_reservation_id: replacementId,
            updated_at: nowIso,
          })
          .eq("linked_reservation_id", provisionalId);
        if (requestRelinkError) throw requestRelinkError;
        const { error: formLogRelinkError } = await supabase
          .from("form_import_log")
          .update({ reservation_id: replacementId })
          .eq("reservation_id", provisionalId);
        if (formLogRelinkError) throw formLogRelinkError;
        const { error: deleteProvisionalError } = await supabase
          .from("reservations")
          .delete()
          .eq("reservation_id", provisionalId);
        if (deleteProvisionalError) throw deleteProvisionalError;
      }

      const requestIdToLink =
        matchedRequest?.request_id ?? record.request_id ?? null;
      if (requestIdToLink) {
        const { error: requestUpdateError } = await supabase
          .from("reservation_requests")
          .update({
            status: "承認済",
            linked_reservation_id: record.reservation_id,
            updated_at: new Date().toISOString(),
          })
          .eq("request_id", requestIdToLink);
        if (requestUpdateError) throw requestUpdateError;
      }

      await logStudioFormImport(supabase, row.sheetRow, record.reservation_id);

      const cacheEntry = {
        reservation_id: record.reservation_id,
        import_row_id: record.import_row_id,
        import_source: record.import_source,
        access_key: record.access_key,
        status: "確定" as const,
        check_in: record.check_in,
        check_out: record.check_out,
        last_name: record.last_name,
        first_name: record.first_name,
        email: record.email,
        phone: record.phone,
        request_id: record.request_id,
        is_archived: false,
      };
      const provisionalIdToReplace = matchedProvisional?.reservation_id ?? null;
      const activeIdx = activeReservations.findIndex(
        (r) =>
          r.reservation_id === record.reservation_id ||
          (provisionalIdToReplace != null &&
            r.reservation_id === provisionalIdToReplace)
      );
      if (activeIdx >= 0) {
        activeReservations[activeIdx] = cacheEntry;
      } else {
        activeReservations.push(cacheEntry);
      }
      const allIdx = allReservations.findIndex(
        (r) =>
          r.reservation_id === record.reservation_id ||
          (provisionalIdToReplace != null &&
            r.reservation_id === provisionalIdToReplace)
      );
      if (allIdx >= 0) {
        allReservations[allIdx] = cacheEntry;
      } else {
        allReservations.push(cacheEntry);
      }
      importLog.set(row.sheetRow, record.reservation_id);
      imported++;
    } catch (e) {
      errors.push(`行${row.sheetRow}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const somenFilledIds = await fillEmptyStudioSomenFromSheet(
    supabase,
    headers,
    rows,
    importLog,
    allReservations
  );
  for (const reservationId of somenFilledIds) {
    if (!pendingGCalIds.includes(reservationId)) {
      pendingGCalIds.push(reservationId);
    }
  }

  for (const reservationId of pendingGCalIds) {
    try {
      await syncReservationToGCal(supabase, reservationId);
    } catch {
      /* best-effort */
    }
  }

  return {
    imported,
    skipped: skippedAlreadyLogged + skippedAlreadyInDb + skippedNotImportable,
    skippedAlreadyLogged,
    skippedAlreadyInDb,
    skippedNotImportable,
    errors,
    totalRows: rows.length,
  };
}

export async function importStudioForms(
  supabase: SupabaseClient
): Promise<ImportResult> {
  const cfg = FORM_SOURCES.booking;
  const { headers, rows } = await fetchSheetRows(
    cfg.spreadsheetId,
    cfg.sheetName,
    cfg.dataColumnCount
  );

  return importStudioFormRows(supabase, headers, rows);
}

export type SyncFormsResult = {
  request: ImportResult;
  studio: ImportResult;
  postLink: {
    linked: number;
    repaired: number;
    skipped: number;
    errors: string[];
  };
  archive?: {
    reservations: number;
    roomAssignments: number;
    requests: number;
  };
  gcal?: {
    synced: number;
    errors: string[];
  };
  runId: string;
};

/** リクエスト → STUDIO → 事後リンク（GAS importAllPendingReservations_ と同順） */
export async function syncAllForms(
  supabase: SupabaseClient
): Promise<SyncFormsResult> {
  assertFormSyncEnabled();
  const runId = await startSyncRun(supabase, "sync-forms");

  try {
    const request = await importRequestForms(supabase);
    const studio = await importStudioForms(supabase);
    const postLink = await linkExistingRequestsAndReservations(supabase);

    const { runDailyArchive } = await import("@/lib/services/archive-daily");
    const archive = await runDailyArchive(supabase);

    // 全件 GCal 同期は重いので取込ジョブからは外す（新規行は import 内で個別同期）
    const gcal = { synced: 0, errors: [] as string[] };

    await finishSyncRun(supabase, runId, {
      status: "success",
      rows_read: request.totalRows + studio.totalRows,
      rows_imported: request.imported + studio.imported,
      rows_skipped: request.skipped + studio.skipped,
      details: { request, studio, postLink, archive, gcal },
    });

    return { request, studio, postLink, archive, gcal, runId };
  } catch (e) {
    await finishSyncRun(supabase, runId, {
      status: "error",
      error_message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
