import type { SupabaseClient } from "@supabase/supabase-js";
import { FORM_SOURCES } from "@/lib/config/forms";
import {
  nextStudioRequestId,
  nextStudioReservationId,
} from "@/lib/import/id-generation";
import {
  isRequestRowImportable,
  mapRequestFormRow,
} from "@/lib/import/request-mapper";
import {
  isStudioRowImportable,
  mapStudioFormRow,
} from "@/lib/import/reservation-mapper";
import { fetchSheetRows } from "@/lib/sheets/client";

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
  totalRows: number;
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

export async function importRequestForms(
  supabase: SupabaseClient
): Promise<ImportResult> {
  const cfg = FORM_SOURCES.request;
  const { headers, rows } = await fetchSheetRows(
    cfg.spreadsheetId,
    cfg.sheetName,
    cfg.dataColumnCount
  );

  const importedRows = await loadImportedRows(supabase, "request");
  const now = new Date();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (importedRows.has(row.sheetRow)) {
      skipped++;
      continue;
    }
    if (!isRequestRowImportable(row, headers)) {
      skipped++;
      continue;
    }

    try {
      const requestId = await nextStudioRequestId(supabase);
      const record = mapRequestFormRow(row, headers, requestId, now);

      const { error: upsertError } = await supabase
        .from("reservation_requests")
        .upsert(record, { onConflict: "request_id" });
      if (upsertError) throw upsertError;

      const { error: logError } = await supabase.from("form_import_log").insert({
        source: "request",
        source_row: row.sheetRow,
        request_id: requestId,
      });
      if (logError) throw logError;

      imported++;
    } catch (e) {
      errors.push(`行${row.sheetRow}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { imported, skipped, errors, totalRows: rows.length };
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

  const importedRows = await loadImportedRows(supabase, "studio");
  const now = new Date();
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (importedRows.has(row.sheetRow)) {
      skipped++;
      continue;
    }
    if (!isStudioRowImportable(row, headers)) {
      skipped++;
      continue;
    }

    try {
      const reservationId = await nextStudioReservationId(supabase);
      const record = mapStudioFormRow(row, headers, reservationId, now);

      const { error: upsertError } = await supabase
        .from("reservations")
        .upsert(record, { onConflict: "reservation_id" });
      if (upsertError) throw upsertError;

      const { error: logError } = await supabase.from("form_import_log").insert({
        source: "studio",
        source_row: row.sheetRow,
        reservation_id: reservationId,
      });
      if (logError) throw logError;

      imported++;
    } catch (e) {
      errors.push(`行${row.sheetRow}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { imported, skipped, errors, totalRows: rows.length };
}

export type SyncFormsResult = {
  request: ImportResult;
  studio: ImportResult;
  runId: string;
};

/** リクエスト → STUDIO の順（GAS importAllPendingReservations_ と同順） */
export async function syncAllForms(
  supabase: SupabaseClient
): Promise<SyncFormsResult> {
  const runId = await startSyncRun(supabase, "sync-forms");

  try {
    const request = await importRequestForms(supabase);
    const studio = await importStudioForms(supabase);

    await finishSyncRun(supabase, runId, {
      status: "success",
      rows_read: request.totalRows + studio.totalRows,
      rows_imported: request.imported + studio.imported,
      rows_skipped: request.skipped + studio.skipped,
      details: { request, studio },
    });

    return { request, studio, runId };
  } catch (e) {
    await finishSyncRun(supabase, runId, {
      status: "error",
      error_message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
