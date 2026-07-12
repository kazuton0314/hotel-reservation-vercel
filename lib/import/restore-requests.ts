import { readFileSync } from "fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { backfillFormImportLog } from "@/lib/import/backfill-form-import-log";
import {
  isRequestDbExportRecord,
  mapRequestCsvRow,
  mapRequestDbExportRow,
  type RequestInsert,
} from "@/lib/import/request-mapper";
import {
  linkArchivedRequestsToReservations,
  repairBidirectionalRequestLinks,
} from "@/lib/import/post-link";
import { syncSequencesFromLedger } from "@/lib/import/id-generation";

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }

  return rows;
}

function csvToRecords(filePath: string): Record<string, unknown>[] {
  const raw = readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) return [];
  const headers = table[0].map((h) => h.trim());
  return table.slice(1).map((values) =>
    Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]))
  );
}

function loadRequestIds(records: Record<string, unknown>[]): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    const id = String(
      record["request_id"] ?? record["リクエストID"] ?? ""
    ).trim();
    if (id) ids.add(id);
  }
  return ids;
}

function mapRestoreRequestRows(
  records: Record<string, unknown>[]
): RequestInsert[] {
  const dbExport = records.some(isRequestDbExportRecord);
  const batch: RequestInsert[] = [];

  for (const record of records) {
    const mapped = dbExport
      ? mapRequestDbExportRow(record)
      : mapRequestCsvRow(record, false);
    if (mapped) batch.push(mapped);
  }

  return batch;
}

async function deleteErroneousRequests(
  supabase: SupabaseClient,
  toDelete: string[]
): Promise<void> {
  if (toDelete.length === 0) return;

  const { error: logError } = await supabase
    .from("form_import_log")
    .delete()
    .in("request_id", toDelete);
  if (logError) throw logError;

  const { error: deleteError } = await supabase
    .from("reservation_requests")
    .delete()
    .in("request_id", toDelete);
  if (deleteError) throw deleteError;
}

export type RestoreRequestsResult = {
  deleted: number;
  upserted: number;
  backfill: { request: number; studio: number };
  repaired: number;
  archivedLinked: number;
  pendingOpenRequests: number;
  brokenLinks: string[];
};

export async function restoreRequestsFromCsv(
  supabase: SupabaseClient,
  goodCsvPath: string,
  badCsvPath?: string
): Promise<RestoreRequestsResult> {
  const goodRecords = csvToRecords(goodCsvPath);
  const goodIds = loadRequestIds(goodRecords);
  let deleted = 0;

  if (badCsvPath) {
    const badIds = loadRequestIds(csvToRecords(badCsvPath));
    const toDelete = [...badIds].filter((id) => !goodIds.has(id));
    if (toDelete.length > 0) {
      await deleteErroneousRequests(supabase, toDelete);
      deleted = toDelete.length;
    }
  }

  const batch = mapRestoreRequestRows(goodRecords);
  const chunkSize = 100;
  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("reservation_requests")
      .upsert(chunk, { onConflict: "request_id" });
    if (error) throw error;
  }

  const repair = await repairBidirectionalRequestLinks(supabase);
  const archivedLink = await linkArchivedRequestsToReservations(supabase);
  const backfill = await backfillFormImportLog(supabase);
  await syncSequencesFromLedger(supabase);

  const { count: pendingOpenRequests, error: countError } = await supabase
    .from("reservation_requests")
    .select("*", { count: "exact", head: true })
    .eq("is_archived", false)
    .eq("status", "リクエスト");
  if (countError) throw countError;

  const brokenLinks: string[] = [];
  const { data: linkedRequests } = await supabase
    .from("reservation_requests")
    .select("request_id, linked_reservation_id")
    .not("linked_reservation_id", "is", null);

  for (const req of linkedRequests ?? []) {
    const { data: reservation } = await supabase
      .from("reservations")
      .select("reservation_id")
      .eq("reservation_id", req.linked_reservation_id as string)
      .maybeSingle();
    if (!reservation) {
      brokenLinks.push(`${req.request_id} → ${req.linked_reservation_id}`);
    }
  }

  return {
    deleted,
    upserted: batch.length,
    backfill,
    repaired: repair.repaired,
    archivedLinked: archivedLink.linked,
    pendingOpenRequests: pendingOpenRequests ?? 0,
    brokenLinks,
  };
}
