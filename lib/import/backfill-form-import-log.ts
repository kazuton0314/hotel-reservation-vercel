import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULTS } from "@/lib/config/forms";

export type FormImportBackfillResult = {
  request: number;
  studio: number;
};

/** CSV移行済み import_row_id から form_import_log を一括登録 */
export async function backfillFormImportLog(
  supabase: SupabaseClient
): Promise<FormImportBackfillResult> {
  const [{ data: requests, error: reqError }, { data: reservations, error: resError }] =
    await Promise.all([
      supabase
        .from("reservation_requests")
        .select("request_id, import_row_id")
        .not("import_row_id", "is", null),
      supabase
        .from("reservations")
        .select("reservation_id, import_row_id, import_source")
        .not("import_row_id", "is", null),
    ]);

  if (reqError) throw reqError;
  if (resError) throw resError;

  const requestLogs = (requests ?? [])
    .map((row) => {
      const sourceRow = parseInt(String(row.import_row_id), 10);
      if (!Number.isFinite(sourceRow) || sourceRow <= 0) return null;
      return {
        source: "request" as const,
        source_row: sourceRow,
        request_id: row.request_id,
      };
    })
    .filter(Boolean) as {
    source: "request";
    source_row: number;
    request_id: string;
  }[];

  const studioLogs = (reservations ?? [])
    .filter((row) => {
      const source = String(row.import_source ?? "").trim();
      return !source || source === DEFAULTS.importSourceStudio;
    })
    .map((row) => {
      const sourceRow = parseInt(String(row.import_row_id), 10);
      if (!Number.isFinite(sourceRow) || sourceRow <= 0) return null;
      return {
        source: "studio" as const,
        source_row: sourceRow,
        reservation_id: row.reservation_id,
      };
    })
    .filter(Boolean) as {
    source: "studio";
    source_row: number;
    reservation_id: string;
  }[];

  const chunkSize = 100;
  for (let i = 0; i < requestLogs.length; i += chunkSize) {
    const chunk = requestLogs.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("form_import_log")
      .upsert(chunk, { onConflict: "source,source_row" });
    if (error) throw error;
  }

  for (let i = 0; i < studioLogs.length; i += chunkSize) {
    const chunk = studioLogs.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("form_import_log")
      .upsert(chunk, { onConflict: "source,source_row" });
    if (error) throw error;
  }

  return { request: requestLogs.length, studio: studioLogs.length };
}
