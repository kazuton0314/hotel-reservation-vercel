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
import type { ReservationInsert } from "@/lib/import/reservation-mapper";

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
  totalRows: number;
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

function normalize(v: string | null | undefined) {
  return String(v ?? "").trim().toLowerCase();
}

function nameMatches(aLast: string | null, aFirst: string | null, bLast: string | null, bFirst: string | null) {
  return normalize(aLast) === normalize(bLast) && normalize(aFirst) === normalize(bFirst);
}

function contactMatches(
  aEmail: string | null,
  aPhone: string | null,
  bEmail: string | null,
  bPhone: string | null
) {
  const emailA = normalize(aEmail);
  const emailB = normalize(bEmail);
  if (emailA && emailB && emailA === emailB) return true;

  const phoneA = normalize(aPhone).replace(/[^\d]/g, "");
  const phoneB = normalize(bPhone).replace(/[^\d]/g, "");
  return Boolean(phoneA && phoneB && phoneA === phoneB);
}

function findMatchingProvisionalReservation(
  reservations: MinimalReservation[],
  record: ReservationInsert
) {
  return reservations.find((r) => {
    if (r.status !== "仮予約") return false;
    if (!nameMatches(r.last_name, r.first_name, record.last_name, record.first_name)) {
      return false;
    }
    if (!contactMatches(r.email, r.phone, record.email, record.phone)) {
      return false;
    }
    return r.check_in === record.check_in;
  });
}

function findMatchingRequestForStudio(
  requests: MinimalRequest[],
  record: ReservationInsert
) {
  return requests.find((req) => {
    if (!["リクエスト", "承認済"].includes(req.status)) return false;
    if (!nameMatches(req.last_name, req.first_name, record.last_name, record.first_name)) {
      return false;
    }
    if (!contactMatches(req.email, req.phone, record.email, record.phone)) {
      return false;
    }
    return req.check_in === record.check_in;
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
  const requests = await loadActiveRequests(supabase);
  const reservations = await loadActiveReservations(supabase);

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
      let record = mapStudioFormRow(row, headers, reservationId, now);

      // 1) 承認済みリクエスト由来の仮予約があれば、その予約IDを引き継いで確定化
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

      // 2) 未連携リクエストがあれば request_id / access_key を引き継ぐ
      const matchedRequest = findMatchingRequestForStudio(requests, record);
      if (matchedRequest) {
        record = {
          ...record,
          request_id: matchedRequest.request_id,
          access_key: matchedRequest.access_key || record.access_key,
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

      // 3) リクエスト側を本予約連携済へ
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

      const { error: logError } = await supabase.from("form_import_log").insert({
        source: "studio",
        source_row: row.sheetRow,
        reservation_id: record.reservation_id,
      });
      if (logError) throw logError;

      // 取込済みメモリを更新（同一run内の重複判定精度向上）
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
