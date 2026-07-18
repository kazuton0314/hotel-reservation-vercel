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

  // source_row 重複があると upsert が一括で失敗するため、後勝ちで一意化
  const requestByRow = new Map<number, { source: "request"; source_row: number; request_id: string }>();
  for (const row of requestLogs) {
    requestByRow.set(row.source_row, row);
  }
  const uniqueRequestLogs = [...requestByRow.values()];

  const studioByRow = new Map<
    number,
    { source: "studio"; source_row: number; reservation_id: string }
  >();
  for (const row of studioLogs) {
    studioByRow.set(row.source_row, row);
  }
  const uniqueStudioLogs = [...studioByRow.values()];

  const chunkSize = 100;
  for (let i = 0; i < uniqueRequestLogs.length; i += chunkSize) {
    const chunk = uniqueRequestLogs.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("form_import_log")
      .upsert(chunk, { onConflict: "source,source_row" });
    if (error) throw error;
  }

  for (let i = 0; i < uniqueStudioLogs.length; i += chunkSize) {
    const chunk = uniqueStudioLogs.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("form_import_log")
      .upsert(chunk, { onConflict: "source,source_row" });
    if (error) throw error;
  }

  return { request: uniqueRequestLogs.length, studio: uniqueStudioLogs.length };
}
