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

/** 複合 import_row_id の誤取込（RQ32〜37） */
export const BAD_REQUEST_IDS = [
  "STUDIO-RQ32",
  "STUDIO-RQ33",
  "STUDIO-RQ34",
  "STUDIO-RQ35",
  "STUDIO-RQ36",
  "STUDIO-RQ37",
] as const;

export const OSAKI_CURRENT_ID = "STUDIO-RQ38";
export const OSAKI_TARGET_ID = "STUDIO-RQ32";
export const YAMAGATA_TARGET_ID = "STUDIO-RQ33";
export const YAMAGATA_SHEET_ROW = 49;

export type BadRequestCandidate = {
  request_id: string;
  import_row_id: string | null;
  last_name: string | null;
  first_name: string | null;
  check_in: string | null;
  status: string | null;
  linked_reservation_id: string | null;
  reason: string[];
};

export function isCorruptedRequestImport(row: {
  request_id: string;
  import_row_id?: string | null;
}): boolean {
  return Boolean(row.import_row_id && String(row.import_row_id).includes(":"));
}

export async function listCorruptedRequestImports(
  supabase: SupabaseClient
): Promise<BadRequestCandidate[]> {
  const { data, error } = await supabase
    .from("reservation_requests")
    .select(
      "request_id, import_row_id, last_name, first_name, check_in, status, linked_reservation_id"
    )
    .like("request_id", "STUDIO-RQ%");
  if (error) throw error;

  return (data ?? [])
    .filter((row) => isCorruptedRequestImport(row))
    .map((row) => {
      const reason: string[] = ["composite import_row_id"];
      if (BAD_REQUEST_IDS.includes(row.request_id as (typeof BAD_REQUEST_IDS)[number])) {
        reason.push("bad batch RQ32-37");
      }
      return {
        request_id: row.request_id as string,
        import_row_id: row.import_row_id as string | null,
        last_name: row.last_name as string | null,
        first_name: row.first_name as string | null,
        check_in: row.check_in as string | null,
        status: row.status as string | null,
        linked_reservation_id: row.linked_reservation_id as string | null,
        reason,
      };
    })
    .sort((a, b) => a.request_id.localeCompare(b.request_id, "en"));
}

export type RecoverBadRequestImportsResult = {
  dryRun: boolean;
  deletedRequestIds: string[];
  clearedReservationRequestIds: string[];
  removedFormImportLogRows: number;
  removedMailLogs: number;
  renumberedOsaki: { from: string; to: string } | null;
  importedYamagata: string | null;
  backfill: { request: number; studio: number };
  sequenceAfter: number | null;
};

async function countResidues(
  supabase: SupabaseClient,
  requestIds: string[]
): Promise<{
  reservationsPointing: number;
  formImportLogs: number;
  mailLogs: number;
}> {
  const [{ count: resCount }, { count: logCount }, { count: mailCount }] =
    await Promise.all([
      supabase
        .from("reservations")
        .select("reservation_id", { count: "exact", head: true })
        .in("request_id", requestIds),
      supabase
        .from("form_import_log")
        .select("id", { count: "exact", head: true })
        .in("request_id", requestIds),
      supabase
        .from("mail_logs")
        .select("mail_log_id", { count: "exact", head: true })
        .eq("entity_type", "request")
        .in("entity_id", requestIds),
    ]);

  return {
    reservationsPointing: resCount ?? 0,
    formImportLogs: logCount ?? 0,
    mailLogs: mailCount ?? 0,
  };
}

export async function auditRequestRecoveryResidues(
  supabase: SupabaseClient
): Promise<{
  candidates: BadRequestCandidate[];
  osaki: Record<string, unknown> | null;
  yamagataExists: boolean;
  residues: {
    reservationsPointing: number;
    formImportLogs: number;
    mailLogs: number;
  };
  reservations2027: number;
  compositeReservations: number;
}> {
  const candidates = await listCorruptedRequestImports(supabase);
  const badIds = candidates.map((c) => c.request_id);
  const allTouch = [...new Set([...badIds, OSAKI_CURRENT_ID, OSAKI_TARGET_ID])];

  const { data: osaki } = await supabase
    .from("reservation_requests")
    .select(
      "request_id, import_row_id, last_name, first_name, check_in, status, linked_reservation_id"
    )
    .eq("request_id", OSAKI_CURRENT_ID)
    .maybeSingle();

  const { data: yama } = await supabase
    .from("reservation_requests")
    .select("request_id")
    .or(
      `import_row_id.eq.${YAMAGATA_SHEET_ROW},email.eq.teetsuya.com@icloud.com`
    )
    .limit(5);

  const [{ count: r2027 }, { count: compositeRes }] = await Promise.all([
    supabase
      .from("reservations")
      .select("reservation_id", { count: "exact", head: true })
      .gte("check_in", "2027-01-01")
      .lte("check_in", "2027-12-31"),
    supabase
      .from("reservations")
      .select("reservation_id", { count: "exact", head: true })
      .like("import_row_id", "%:%"),
  ]);

  return {
    candidates,
    osaki: (osaki as Record<string, unknown> | null) ?? null,
    yamagataExists: (yama ?? []).length > 0,
    residues: await countResidues(supabase, allTouch),
    reservations2027: r2027 ?? 0,
    compositeReservations: compositeRes ?? 0,
  };
}

async function renumberOsakiToRq32(supabase: SupabaseClient): Promise<void> {
  const { data: osaki, error } = await supabase
    .from("reservation_requests")
    .select("*")
    .eq("request_id", OSAKI_CURRENT_ID)
    .single();
  if (error) throw error;
  if (!osaki) throw new Error(`${OSAKI_CURRENT_ID} が見つかりません`);
  if (String(osaki.import_row_id) !== "48") {
    throw new Error(
      `${OSAKI_CURRENT_ID} の import_row_id が 48 ではありません: ${osaki.import_row_id}`
    );
  }

  const { data: conflict } = await supabase
    .from("reservation_requests")
    .select("request_id")
    .eq("request_id", OSAKI_TARGET_ID)
    .maybeSingle();
  if (conflict) {
    throw new Error(`${OSAKI_TARGET_ID} がまだ残っているためリネームできません`);
  }

  const { request_id: _old, ...rest } = osaki as Record<string, unknown> & {
    request_id: string;
  };
  const inserted = {
    ...rest,
    request_id: OSAKI_TARGET_ID,
    updated_at: new Date().toISOString(),
  };

  const { error: insError } = await supabase
    .from("reservation_requests")
    .insert(inserted);
  if (insError) throw insError;

  const { error: delError } = await supabase
    .from("reservation_requests")
    .delete()
    .eq("request_id", OSAKI_CURRENT_ID);
  if (delError) throw delError;
}

async function importYamagataAsRq33(
  supabase: SupabaseClient
): Promise<RequestInsert> {
  const { data: existing } = await supabase
    .from("reservation_requests")
    .select("request_id")
    .eq("request_id", YAMAGATA_TARGET_ID)
    .maybeSingle();
  if (existing) {
    throw new Error(`${YAMAGATA_TARGET_ID} が既に存在します`);
  }

  const cfg = FORM_SOURCES.request;
  const { headers, rows } = await fetchSheetRows(
    cfg.spreadsheetId,
    cfg.sheetName,
    cfg.dataColumnCount
  );
  const row = rows.find((r) => r.sheetRow === YAMAGATA_SHEET_ROW);
  if (!row) {
    throw new Error(`スプシ行 ${YAMAGATA_SHEET_ROW} が見つかりません`);
  }
  if (!isRequestRowImportable(row, headers)) {
    throw new Error(`スプシ行 ${YAMAGATA_SHEET_ROW} は取込不可です`);
  }

  const now = new Date();
  const mapped = mapRequestFormRow(row, headers, YAMAGATA_TARGET_ID, now, {
    validateBookingHorizon: false,
  });
  if (mapped.last_name !== "山形") {
    throw new Error(
      `行${YAMAGATA_SHEET_ROW} の姓が想定外です: ${mapped.last_name}`
    );
  }

  const record: RequestInsert = {
    ...mapped,
    request_id: YAMAGATA_TARGET_ID,
    import_row_id: String(YAMAGATA_SHEET_ROW),
  };

  const { error } = await supabase.from("reservation_requests").insert(record);
  if (error) throw error;
  return record;
}

/**
 * RQ32〜37（複合ID誤取込）を削除し、大﨑→RQ32・山形→RQ33 に揃える。
 */
export async function recoverBadRequestImports(
  supabase: SupabaseClient,
  options: { dryRun?: boolean } = {}
): Promise<RecoverBadRequestImportsResult> {
  const dryRun = options.dryRun !== false;
  const candidates = await listCorruptedRequestImports(supabase);
  const badIds = candidates.map((c) => c.request_id);

  const clearedReservationRequestIds: string[] = [];
  let removedFormImportLogRows = 0;
  let removedMailLogs = 0;
  let renumberedOsaki: { from: string; to: string } | null = null;
  let importedYamagata: string | null = null;

  if (!dryRun) {
    const touchIds = [...new Set([...badIds, OSAKI_CURRENT_ID])];

    if (badIds.length > 0) {
      console.log(`[1/7] form_import_log 削除 (request_id in bad+Osaki)`);
      const { data: logs, error: logFetchError } = await supabase
        .from("form_import_log")
        .select("id")
        .in("request_id", touchIds);
      if (logFetchError) throw logFetchError;
      removedFormImportLogRows = logs?.length ?? 0;
      if (removedFormImportLogRows > 0) {
        const { error } = await supabase
          .from("form_import_log")
          .delete()
          .in("request_id", touchIds);
        if (error) throw error;
      }

      console.log(`[2/7] mail_logs 確認`);
      const { data: mails, error: mailFetchError } = await supabase
        .from("mail_logs")
        .select("mail_log_id")
        .eq("entity_type", "request")
        .in("entity_id", touchIds);
      if (mailFetchError) throw mailFetchError;
      removedMailLogs = mails?.length ?? 0;
      if (removedMailLogs > 0) {
        const { error } = await supabase
          .from("mail_logs")
          .delete()
          .eq("entity_type", "request")
          .in("entity_id", touchIds);
        if (error) {
          console.warn(
            `  warn: mail_logs 削除不可 (${removedMailLogs}件残存): ${error.message}`
          );
          removedMailLogs = 0;
        }
      }

      console.log(`[3/7] reservations.request_id 解除`);
      const { data: linkedRes, error: resFetchError } = await supabase
        .from("reservations")
        .select("reservation_id, request_id")
        .in("request_id", badIds);
      if (resFetchError) throw resFetchError;
      for (const row of linkedRes ?? []) {
        const { error } = await supabase
          .from("reservations")
          .update({
            request_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("reservation_id", row.reservation_id);
        if (error) throw error;
        clearedReservationRequestIds.push(row.reservation_id as string);
        console.log(`  cleared ${row.reservation_id} <- ${row.request_id}`);
      }

      console.log(`[4/7] 誤リクエスト削除: ${badIds.length} 件`);
      const { error: delError } = await supabase
        .from("reservation_requests")
        .delete()
        .in("request_id", badIds);
      if (delError) throw delError;
    } else {
      console.log(`[1-4/7] 複合IDリクエストなし（スキップ）`);
    }

    const { data: osakiNow } = await supabase
      .from("reservation_requests")
      .select("request_id, import_row_id, last_name")
      .eq("request_id", OSAKI_TARGET_ID)
      .maybeSingle();
    const { data: osakiOld } = await supabase
      .from("reservation_requests")
      .select("request_id")
      .eq("request_id", OSAKI_CURRENT_ID)
      .maybeSingle();

    if (osakiOld) {
      console.log(`[5/7] 大﨑 ${OSAKI_CURRENT_ID} → ${OSAKI_TARGET_ID}`);
      await renumberOsakiToRq32(supabase);
      renumberedOsaki = { from: OSAKI_CURRENT_ID, to: OSAKI_TARGET_ID };
    } else if (
      osakiNow &&
      String(osakiNow.import_row_id) === "48" &&
      osakiNow.last_name === "大﨑"
    ) {
      console.log(`[5/7] 大﨑は既に ${OSAKI_TARGET_ID}`);
      renumberedOsaki = { from: OSAKI_CURRENT_ID, to: OSAKI_TARGET_ID };
    } else {
      throw new Error(
        `大﨑のリネーム元 (${OSAKI_CURRENT_ID}) も先 (${OSAKI_TARGET_ID}) も見つかりません`
      );
    }

    const { data: yamaNow } = await supabase
      .from("reservation_requests")
      .select("request_id, import_row_id, last_name")
      .eq("request_id", YAMAGATA_TARGET_ID)
      .maybeSingle();
    if (
      yamaNow &&
      String(yamaNow.import_row_id) === String(YAMAGATA_SHEET_ROW) &&
      yamaNow.last_name === "山形"
    ) {
      console.log(`[6/7] 山形は既に ${YAMAGATA_TARGET_ID}`);
      importedYamagata = YAMAGATA_TARGET_ID;
    } else if (yamaNow) {
      throw new Error(
        `${YAMAGATA_TARGET_ID} が別内容で存在します: ${yamaNow.last_name} row=${yamaNow.import_row_id}`
      );
    } else {
      console.log(`[6/7] 山形を ${YAMAGATA_TARGET_ID} として取込`);
      await importYamagataAsRq33(supabase);
      importedYamagata = YAMAGATA_TARGET_ID;
    }

    console.log(`[7/7] form_import_log backfill + 採番再同期`);
  }

  let backfill = { request: 0, studio: 0 };
  let sequenceAfter: number | null = null;
  if (!dryRun) {
    backfill = await backfillFormImportLog(supabase);
    await syncSequencesFromLedger(supabase);
    const { data: seq } = await supabase
      .from("import_sequences")
      .select("current_value")
      .eq("key", "studio_rq")
      .maybeSingle();
    sequenceAfter = seq?.current_value ?? null;
    console.log(
      `  backfill request=${backfill.request} studio=${backfill.studio} seq=${sequenceAfter}`
    );
  }

  return {
    dryRun,
    deletedRequestIds: badIds,
    clearedReservationRequestIds,
    removedFormImportLogRows,
    removedMailLogs,
    renumberedOsaki,
    importedYamagata,
    backfill,
    sequenceAfter,
  };
}
