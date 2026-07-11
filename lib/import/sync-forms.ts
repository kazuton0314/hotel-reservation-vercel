import type { SupabaseClient } from "@supabase/supabase-js";
import { FORM_SOURCES } from "@/lib/config/forms";
import {
  nextStudioRequestId,
  nextStudioReservationId,
} from "@/lib/import/id-generation";
import {
  bookingEntryMatchesForLink,
  contactMatches,
  isRequestOpenForLink,
  nameMatches,
  stayMatches,
} from "@/lib/import/match-utils";
import {
  isRequestRowImportable,
  mapRequestFormRow,
} from "@/lib/import/request-mapper";
import {
  isStudioRowImportable,
  mapStudioFormRow,
} from "@/lib/import/reservation-mapper";
import type { ReservationInsert } from "@/lib/import/reservation-mapper";
import { linkExistingRequestsAndReservations } from "@/lib/import/post-link";
import { syncReservationToGCal } from "@/lib/services/gcal-sync";
import { fetchSheetRows } from "@/lib/sheets/client";
import type { SheetRow } from "@/lib/sheets/client";

export type ImportResult = {
  imported: number;
  skipped: number;
  skippedAlreadyLogged: number;
  skippedNotImportable: number;
  errors: string[];
  totalRows: number;
};

export type ImportFormRowsOptions = {
  /** form_import_log に載っていても再取込する（CSVテスト向け） */
  force?: boolean;
};

type MinimalRequest = {
  request_id: string;
  access_key: string | null;
  status: string;
  check_in: string | null;
  check_out: string | null;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  linked_reservation_id: string | null;
};

type MinimalReservation = {
  reservation_id: string;
  access_key: string | null;
  status: string;
  check_in: string | null;
  check_out: string | null;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  request_id: string | null;
};

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

async function loadActiveRequests(
  supabase: SupabaseClient
): Promise<MinimalRequest[]> {
  const { data, error } = await supabase
    .from("reservation_requests")
    .select(
      "request_id, access_key, status, check_in, check_out, last_name, first_name, email, phone, linked_reservation_id"
    )
    .eq("is_archived", false);
  if (error) throw error;
  return (data ?? []) as MinimalRequest[];
}

async function loadActiveReservations(
  supabase: SupabaseClient
): Promise<MinimalReservation[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "reservation_id, access_key, status, check_in, check_out, last_name, first_name, email, phone, request_id"
    )
    .eq("is_archived", false);
  if (error) throw error;
  return (data ?? []) as MinimalReservation[];
}

function findMatchingProvisionalReservation(
  reservations: MinimalReservation[],
  record: ReservationInsert
) {
  return reservations.find((r) => {
    if (r.status !== "仮予約") return false;
    return bookingEntryMatchesForLink(r, record);
  });
}

function findMatchingRequestForStudio(
  requests: MinimalRequest[],
  record: ReservationInsert
) {
  return requests.find((req) => {
    if (!isRequestOpenForLink(req.status)) return false;
    return bookingEntryMatchesForLink(req, record);
  });
}

function findDuplicateRequest(
  requests: MinimalRequest[],
  row: {
    last_name: string | null;
    first_name: string | null;
    email: string | null;
    phone: string | null;
    check_in: string | null;
    check_out: string | null;
  }
) {
  return requests.find((req) => {
    if (!isRequestOpenForLink(req.status) && req.status !== "本予約連携済") {
      return false;
    }
    if (!nameMatches(req.last_name, req.first_name, row.last_name, row.first_name)) {
      return false;
    }
    if (!contactMatches(req.email, req.phone, row.email, row.phone)) return false;
    return stayMatches(req.check_in, req.check_out, row.check_in, row.check_out);
  });
}

function findDuplicateConfirmedReservation(
  reservations: MinimalReservation[],
  record: ReservationInsert
) {
  return reservations.find((r) => {
    if (r.status !== "確定") return false;
    return bookingEntryMatchesForLink(r, record);
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
  let skippedNotImportable = 0;
  const errors: string[] = [];
  const requests = await loadActiveRequests(supabase);

  for (const row of rows) {
    if (!options.force && importedRows.has(row.sheetRow)) {
      skippedAlreadyLogged++;
      continue;
    }
    if (!isRequestRowImportable(row, headers)) {
      skippedNotImportable++;
      continue;
    }

    try {
      const requestId = await nextStudioRequestId(supabase);
      const record = mapRequestFormRow(row, headers, requestId, now);

      const duplicate = findDuplicateRequest(requests, record);
      const targetId = duplicate?.request_id ?? requestId;

      const { error: upsertError } = await supabase
        .from("reservation_requests")
        .upsert(
          { ...record, request_id: targetId },
          { onConflict: "request_id" }
        );
      if (upsertError) throw upsertError;

      const { error: logError } = await supabase.from("form_import_log").upsert(
        {
          source: "request",
          source_row: row.sheetRow,
          request_id: targetId,
        },
        { onConflict: "source,source_row" }
      );
      if (logError) throw logError;

      if (!duplicate) {
        requests.push({
          request_id: targetId,
          access_key: record.access_key,
          status: record.status,
          check_in: record.check_in,
          check_out: record.check_out,
          last_name: record.last_name,
          first_name: record.first_name,
          email: record.email,
          phone: record.phone,
          linked_reservation_id: null,
        });
      }
      imported++;
    } catch (e) {
      errors.push(`行${row.sheetRow}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    imported,
    skipped: skippedAlreadyLogged + skippedNotImportable,
    skippedAlreadyLogged,
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
  let skippedNotImportable = 0;
  const errors: string[] = [];
  const requests = await loadActiveRequests(supabase);
  const reservations = await loadActiveReservations(supabase);

  for (const row of rows) {
    if (!options.force && importedRows.has(row.sheetRow)) {
      skippedAlreadyLogged++;
      continue;
    }
    if (!isStudioRowImportable(row, headers)) {
      skippedNotImportable++;
      continue;
    }

    try {
      const reservationId = await nextStudioReservationId(supabase);
      let record = mapStudioFormRow(row, headers, reservationId, now);

      const matchedProvisional = findMatchingProvisionalReservation(
        reservations,
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

      const matchedRequest = findMatchingRequestForStudio(requests, record);
      if (matchedRequest) {
        record = {
          ...record,
          request_id: matchedRequest.request_id,
          access_key: matchedRequest.access_key || record.access_key,
        };
      }

      const duplicateConfirmed = findDuplicateConfirmedReservation(
        reservations,
        record
      );
      if (duplicateConfirmed) {
        record = {
          ...record,
          reservation_id: duplicateConfirmed.reservation_id,
          access_key: duplicateConfirmed.access_key || record.access_key,
          request_id: duplicateConfirmed.request_id || record.request_id,
        };
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

      await syncReservationToGCal(supabase, record.reservation_id);

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

      const { error: logError } = await supabase.from("form_import_log").upsert(
        {
          source: "studio",
          source_row: row.sheetRow,
          reservation_id: record.reservation_id,
        },
        { onConflict: "source,source_row" }
      );
      if (logError) throw logError;

      reservations.push({
        reservation_id: record.reservation_id,
        access_key: record.access_key,
        status: "確定",
        check_in: record.check_in,
        check_out: record.check_out,
        last_name: record.last_name,
        first_name: record.first_name,
        email: record.email,
        phone: record.phone,
        request_id: record.request_id,
      });
      imported++;
    } catch (e) {
      errors.push(`行${row.sheetRow}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    imported,
    skipped: skippedAlreadyLogged + skippedNotImportable,
    skippedAlreadyLogged,
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

    const { syncAllActiveReservationsToGCal } = await import(
      "@/lib/services/gcal-sync"
    );
    const gcal = await syncAllActiveReservationsToGCal(supabase);

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
