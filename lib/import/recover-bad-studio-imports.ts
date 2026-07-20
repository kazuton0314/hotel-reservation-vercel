import type { SupabaseClient } from "@supabase/supabase-js";
import { backfillFormImportLog } from "@/lib/import/backfill-form-import-log";
import { syncSequencesFromLedger } from "@/lib/import/id-generation";
import { deleteGCalEventIfAny } from "@/lib/services/gcal-sync";

/** 誤取込バッチの開始 ID（この番号以上の STUDIO-MT は今回の障害対象） */
export const BAD_IMPORT_MT_FLOOR = 167;

export type BadImportCandidate = {
  reservation_id: string;
  import_row_id: string | null;
  representative_name: string | null;
  check_in: string | null;
  request_id: string | null;
  gcal_event_id: string | null;
  sheet_created_at: string | null;
  reason: string[];
};

export function parseStudioMtNumber(reservationId: string): number | null {
  const m = reservationId.match(/^STUDIO-MT(\d+)$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

/** 障害取込で作られた本予約かどうか */
export function isCorruptedStudioImport(row: {
  reservation_id: string;
  import_row_id?: string | null;
}): boolean {
  const reasons: string[] = [];
  const num = parseStudioMtNumber(row.reservation_id);
  if (num !== null && num >= BAD_IMPORT_MT_FLOOR) {
    reasons.push(`reservation_id>=STUDIO-MT${BAD_IMPORT_MT_FLOOR}`);
  }
  if (row.import_row_id && String(row.import_row_id).includes(":")) {
    reasons.push("composite import_row_id");
  }
  return reasons.length > 0;
}

export function describeCorruptedStudioImport(row: {
  reservation_id: string;
  import_row_id?: string | null;
}): string[] {
  const reasons: string[] = [];
  const num = parseStudioMtNumber(row.reservation_id);
  if (num !== null && num >= BAD_IMPORT_MT_FLOOR) {
    reasons.push(`reservation_id>=STUDIO-MT${BAD_IMPORT_MT_FLOOR}`);
  }
  if (row.import_row_id && String(row.import_row_id).includes(":")) {
    reasons.push("composite import_row_id");
  }
  return reasons;
}

export async function listCorruptedStudioImports(
  supabase: SupabaseClient
): Promise<BadImportCandidate[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "reservation_id, import_row_id, representative_name, check_in, request_id, gcal_event_id, sheet_created_at"
    )
    .like("reservation_id", "STUDIO-MT%");

  if (error) throw error;

  return (data ?? [])
    .filter((row) => isCorruptedStudioImport(row))
    .map((row) => ({
      reservation_id: row.reservation_id as string,
      import_row_id: row.import_row_id as string | null,
      representative_name: row.representative_name as string | null,
      check_in: row.check_in as string | null,
      request_id: row.request_id as string | null,
      gcal_event_id: row.gcal_event_id as string | null,
      sheet_created_at: row.sheet_created_at as string | null,
      reason: describeCorruptedStudioImport(row),
    }))
    .sort((a, b) => {
      const an = parseStudioMtNumber(a.reservation_id) ?? 0;
      const bn = parseStudioMtNumber(b.reservation_id) ?? 0;
      return an - bn;
    });
}

export type RecoverBadStudioImportsResult = {
  dryRun: boolean;
  deletedReservationIds: string[];
  deletedGcalEventIds: string[];
  clearedRequestLinks: string[];
  removedFormImportLogRows: number;
  backfill: { request: number; studio: number };
};

export async function recoverBadStudioImports(
  supabase: SupabaseClient,
  options: { dryRun?: boolean } = {}
): Promise<RecoverBadStudioImportsResult> {
  const dryRun = options.dryRun !== false;
  const candidates = await listCorruptedStudioImports(supabase);
  const badIds = new Set(candidates.map((c) => c.reservation_id));

  const deletedGcalEventIds: string[] = [];
  const clearedRequestLinks: string[] = [];

  if (!dryRun) {
    const withGcal = candidates.filter((c) => c.gcal_event_id);
    console.log(`[1/5] GCal 削除: ${withGcal.length} 件`);
    for (let i = 0; i < withGcal.length; i++) {
      const row = withGcal[i]!;
      console.log(
        `  (${i + 1}/${withGcal.length}) ${row.reservation_id} event=${row.gcal_event_id}`
      );
      try {
        await Promise.race([
          deleteGCalEventIfAny(row.gcal_event_id),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("GCal delete timeout 20s")), 20_000)
          ),
        ]);
        deletedGcalEventIds.push(row.gcal_event_id!);
      } catch (e) {
        console.warn(
          `  warn: GCal削除スキップ ${row.reservation_id}: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }

    console.log(`[2/5] room_assignments 削除`);
    const { error: raError } = await supabase
      .from("room_assignments")
      .delete()
      .in("reservation_id", [...badIds]);
    if (raError) throw raError;

    console.log(`[3/5] リクエスト側リンク解除`);
    const { data: linkedRequests, error: reqFetchError } = await supabase
      .from("reservation_requests")
      .select("request_id, linked_reservation_id")
      .in("linked_reservation_id", [...badIds]);
    if (reqFetchError) throw reqFetchError;

    for (const req of linkedRequests ?? []) {
      const { error } = await supabase
        .from("reservation_requests")
        .update({
          linked_reservation_id: null,
          status: "承認済",
          updated_at: new Date().toISOString(),
        })
        .eq("request_id", req.request_id);
      if (error) throw error;
      clearedRequestLinks.push(req.request_id as string);
      console.log(`  cleared ${req.request_id}`);
    }

    console.log(`[4/5] 誤予約 ${badIds.size} 件を削除`);
    // FK: form_import_log → reservations のため、ログを先に消す
    const { error: delLogError } = await supabase
      .from("form_import_log")
      .delete()
      .eq("source", "studio")
      .in("reservation_id", [...badIds]);
    if (delLogError) throw delLogError;

    const { error: unlinkError } = await supabase
      .from("reservations")
      .update({ request_id: null, updated_at: new Date().toISOString() })
      .in("reservation_id", [...badIds]);
    if (unlinkError) throw unlinkError;

    const { error: delResError } = await supabase
      .from("reservations")
      .delete()
      .in("reservation_id", [...badIds]);
    if (delResError) throw delResError;
  }

  let removedFormImportLogRows = 0;
  if (!dryRun) {
    removedFormImportLogRows = badIds.size;
  }

  let backfill = { request: 0, studio: 0 };
  if (!dryRun) {
    console.log(`[5/5] form_import_log backfill + 採番再同期`);
    backfill = await backfillFormImportLog(supabase);
    await syncSequencesFromLedger(supabase);
    console.log(
      `  backfill request=${backfill.request} studio=${backfill.studio}`
    );
  }

  return {
    dryRun,
    deletedReservationIds: candidates.map((c) => c.reservation_id),
    deletedGcalEventIds,
    clearedRequestLinks,
    removedFormImportLogRows,
    backfill,
  };
}
