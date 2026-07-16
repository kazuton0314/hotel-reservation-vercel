import type { SupabaseClient } from "@supabase/supabase-js";
import { FORM_SOURCES } from "@/lib/config/forms";
import {
  findDuplicateRequest,
  findDuplicateReservation,
  findRequestByImportRowId,
  findReservationByImportRowId,
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
  isRequestOpenForLink,
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
} from "@/lib/import/reservation-mapper";
import type { ReservationInsert } from "@/lib/import/reservation-mapper";
import { syncReservationToGCal } from "@/lib/services/gcal-sync";
import { fetchSheetRows } from "@/lib/sheets/client";
import type { SheetRow } from "@/lib/sheets/client";

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

async function loadImportedRows(
  supabase: SupabaseClient,
  source: "studio" | "request"
): Promise<Set<number>> {
  const { data } = await supabase
    .from("form_import_log")
    .select("source_row")
    .eq("source", source);

  return new Set((data ?? []).map((r) => r.source_row));
}

async function loadActiveReservationsForMatching(
  supabase: SupabaseClient
): Promise<ActiveReservation[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "reservation_id, import_row_id, access_key, status, check_in, check_out, last_name, first_name, email, phone, request_id, is_archived"
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
    if (!isRequestOpenForLink(req.status)) return false;
    return bookingEntryMatchesForLink(req, record);
  });
}

function findDuplicateConfirmedReservation(
  reservations: ActiveReservation[],
  record: ReservationInsert
) {
  return reservations.find((r) => {
    if (r.status !== "確定") return false;
    return bookingEntryMatchesForLink(r, record);
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
  const importedRows = await loadImportedRows(supabase, "request");
  const now = new Date();
  let imported = 0;
  let skippedAlreadyLogged = 0;
  let skippedAlreadyInDb = 0;
  let skippedNotImportable = 0;
  const errors: string[] = [];
  const requests = await loadAllRequestsForImport(supabase);

  for (const row of rows) {
    if (!options.force && importedRows.has(row.sheetRow)) {
      // 誤って log だけ残っている場合（reservation に import_row_id なし）は再取込を許可
      const owned = findRequestByImportRowId(requests, row.sheetRow);
      if (owned) {
        skippedAlreadyLogged++;
        continue;
      }
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

      const duplicate = findDuplicateRequest(requests, incoming);
      if (duplicate) {
        await logRequestFormImport(supabase, row.sheetRow, duplicate.request_id);
        skippedAlreadyInDb++;
        continue;
      }

      const requestId = await nextStudioRequestId(supabase);
      const record: RequestInsert = { ...incoming, request_id: requestId };

      const { error: upsertError } = await supabase
        .from("reservation_requests")
        .upsert(record, { onConflict: "request_id" });
      if (upsertError) throw upsertError;

      await logRequestFormImport(supabase, row.sheetRow, requestId);

      pushRequestCache(requests, record);
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

export async function importStudioFormRows(
  supabase: SupabaseClient,
  headers: string[],
  rows: SheetRow[],
  options: ImportFormRowsOptions = {}
): Promise<ImportResult> {
  const importedRows = await loadImportedRows(supabase, "studio");
  const now = new Date();
  let imported = 0;
  let skippedAlreadyLogged = 0;
  let skippedAlreadyInDb = 0;
  let skippedNotImportable = 0;
  const errors: string[] = [];
  const allReservations = await loadAllReservationsForImport(supabase);
  const activeReservations = await loadActiveReservationsForMatching(supabase);
  const activeRequests = await loadActiveRequestsForMatching(supabase);

  for (const row of rows) {
    if (!options.force && importedRows.has(row.sheetRow)) {
      // 誤って log だけ残っている場合（reservation に import_row_id なし）は再取込を許可
      const owned = findReservationByImportRowId(allReservations, row.sheetRow);
      if (owned) {
        skippedAlreadyLogged++;
        continue;
      }
    }
    if (!isStudioRowImportable(row, headers)) {
      skippedNotImportable++;
      continue;
    }

    try {
      const existingByRow = findReservationByImportRowId(allReservations, row.sheetRow);
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

      let record = { ...incoming };

      // 仮予約 → 確定へ昇格（姓名+連絡先+月日一致のリンク照合）
      const matchedProvisional = findMatchingProvisionalReservation(
        activeReservations,
        record
      );
      if (matchedProvisional) {
        record = {
          ...record,
          reservation_id: matchedProvisional.reservation_id,
          access_key: matchedProvisional.access_key || record.access_key,
          request_id: matchedProvisional.request_id || null,
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

      // 同一確定予約（年月日完全一致）へマージ。それ以外は新規採番
      if (record.reservation_id === draftId) {
        const duplicateConfirmed = findDuplicateConfirmedReservation(
          activeReservations,
          record
        );
        if (duplicateConfirmed) {
          // 確定同士の完全一致のみ再利用（年ズレ救済は仮予約リンクに限定）
          const exact =
            duplicateConfirmed.check_in === record.check_in &&
            (!duplicateConfirmed.check_out ||
              !record.check_out ||
              duplicateConfirmed.check_out === record.check_out);
          if (exact) {
            record = {
              ...record,
              reservation_id: duplicateConfirmed.reservation_id,
              access_key: duplicateConfirmed.access_key || record.access_key,
              request_id: duplicateConfirmed.request_id || record.request_id,
            };
          }
        }
      }

      if (record.reservation_id === draftId) {
        // ハード重複（年月日完全一致・アーカイブ除外）→ 既存 ID にログのみ
        const hardDuplicate = findDuplicateReservation(allReservations, incoming);
        if (hardDuplicate) {
          await logStudioFormImport(
            supabase,
            row.sheetRow,
            hardDuplicate.reservation_id
          );
          skippedAlreadyInDb++;
          continue;
        }

        const reservationId = await nextStudioReservationId(supabase);
        record = { ...record, reservation_id: reservationId };
      }

      const { error: upsertError } = await supabase.from("reservations").upsert(
        {
          ...record,
          status: "確定",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "reservation_id" }
      );
      if (upsertError) throw upsertError;

      // 取込本体を優先。GCal 失敗で取込を落とさない
      try {
        await syncReservationToGCal(supabase, record.reservation_id);
      } catch {
        /* best-effort */
      }

      if (matchedRequest) {
        const { error: requestUpdateError } = await supabase
          .from("reservation_requests")
          .update({
            status: "本予約連携済",
            linked_reservation_id: record.reservation_id,
            updated_at: new Date().toISOString(),
          })
          .eq("request_id", matchedRequest.request_id);
        if (requestUpdateError) throw requestUpdateError;
      }

      await logStudioFormImport(supabase, row.sheetRow, record.reservation_id);

      activeReservations.push({
        reservation_id: record.reservation_id,
        import_row_id: record.import_row_id,
        access_key: record.access_key,
        status: "確定",
        check_in: record.check_in,
        check_out: record.check_out,
        last_name: record.last_name,
        first_name: record.first_name,
        email: record.email,
        phone: record.phone,
        request_id: record.request_id,
        is_archived: false,
      });
      allReservations.push({
        reservation_id: record.reservation_id,
        import_row_id: record.import_row_id,
        access_key: record.access_key,
        status: "確定",
        check_in: record.check_in,
        check_out: record.check_out,
        last_name: record.last_name,
        first_name: record.first_name,
        email: record.email,
        phone: record.phone,
        request_id: record.request_id,
        is_archived: false,
      });
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
