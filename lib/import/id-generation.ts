import type { SupabaseClient } from "@supabase/supabase-js";

const PREFIX = {
  studio: "STUDIO-",
  manual: "MANUAL-",
} as const;

function formatStudioRequestId(seq: number) {
  return `${PREFIX.studio}RQ${seq}`;
}

function formatStudioReservationId(seq: number) {
  return `${PREFIX.studio}MT${seq}`;
}

function parseMaxSeq(ids: string[], pattern: RegExp): number {
  let max = 0;
  for (const id of ids) {
    const m = id.match(pattern);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

/** 台帳の既存 ID から連番を同期してから次 ID を発行 */
export async function nextStudioRequestId(
  supabase: SupabaseClient
): Promise<string> {
  const { data: requests } = await supabase
    .from("reservation_requests")
    .select("request_id");
  const fromDb = parseMaxSeq(
    (requests ?? []).map((r) => r.request_id),
    /^STUDIO-RQ(\d+)$/
  );

  const { data: seqRow } = await supabase
    .from("import_sequences")
    .select("current_value")
    .eq("key", "studio_rq")
    .single();

  const current = Math.max(fromDb, seqRow?.current_value ?? 0);
  const next = current + 1;

  await supabase
    .from("import_sequences")
    .update({ current_value: next, updated_at: new Date().toISOString() })
    .eq("key", "studio_rq");

  return formatStudioRequestId(next);
}

export async function nextStudioReservationId(
  supabase: SupabaseClient
): Promise<string> {
  const { data: reservations } = await supabase
    .from("reservations")
    .select("reservation_id");
  const fromDb = parseMaxSeq(
    (reservations ?? []).map((r) => r.reservation_id),
    /^STUDIO-MT(\d+)$/
  );

  const { data: seqRow } = await supabase
    .from("import_sequences")
    .select("current_value")
    .eq("key", "studio_mt")
    .single();

  const current = Math.max(fromDb, seqRow?.current_value ?? 0);
  const next = current + 1;

  await supabase
    .from("import_sequences")
    .update({ current_value: next, updated_at: new Date().toISOString() })
    .eq("key", "studio_mt");

  return formatStudioReservationId(next);
}

/** CSV インポート後に連番テーブルを台帳の最大値へ同期 */
function formatManualReservationId(seq: number) {
  return `${PREFIX.manual}MT${seq}`;
}

function raSeqKey(year: number) {
  return `ra_${year}`;
}

function formatRoomAssignmentId(year: number, seq: number) {
  return `RA-${year}-${String(seq).padStart(4, "0")}`;
}

export async function nextManualReservationId(
  supabase: SupabaseClient
): Promise<string> {
  const { data: reservations } = await supabase
    .from("reservations")
    .select("reservation_id");
  const fromDb = parseMaxSeq(
    (reservations ?? []).map((r) => r.reservation_id),
    /^MANUAL-MT(\d+)$/
  );

  const { data: seqRow } = await supabase
    .from("import_sequences")
    .select("current_value")
    .eq("key", "manual_mt")
    .single();

  const current = Math.max(fromDb, seqRow?.current_value ?? 0);
  const next = current + 1;

  await supabase
    .from("import_sequences")
    .update({ current_value: next, updated_at: new Date().toISOString() })
    .eq("key", "manual_mt");

  return formatManualReservationId(next);
}

/** GAS generateRoomAssignmentId_ 相当（RA-YYYY-NNNN） */
export async function nextRoomAssignmentId(
  supabase: SupabaseClient,
  year: number = new Date().getFullYear()
): Promise<string> {
  const prefix = `RA-${year}-`;
  const key = raSeqKey(year);

  const { data: assignments } = await supabase
    .from("room_assignments")
    .select("room_assignment_id");
  let fromDb = 0;
  for (const row of assignments ?? []) {
    const id = row.room_assignment_id;
    if (id.startsWith(prefix)) {
      const parsed = parseInt(id.slice(prefix.length), 10);
      if (!Number.isNaN(parsed)) fromDb = Math.max(fromDb, parsed);
    }
  }

  const { data: seqRow } = await supabase
    .from("import_sequences")
    .select("current_value")
    .eq("key", key)
    .maybeSingle();

  const current = Math.max(fromDb, seqRow?.current_value ?? 0);
  const next = current + 1;

  await supabase.from("import_sequences").upsert(
    { key, current_value: next, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );

  return formatRoomAssignmentId(year, next);
}

export async function syncSequencesFromLedger(
  supabase: SupabaseClient
): Promise<void> {
  const [{ data: reservations }, { data: requests }] = await Promise.all([
    supabase.from("reservations").select("reservation_id"),
    supabase.from("reservation_requests").select("request_id"),
  ]);

  const mtMax = parseMaxSeq(
    (reservations ?? []).map((r) => r.reservation_id),
    /^STUDIO-MT(\d+)$/
  );
  const rqMax = parseMaxSeq(
    (requests ?? []).map((r) => r.request_id),
    /^STUDIO-RQ(\d+)$/
  );
  const manualMax = parseMaxSeq(
    (reservations ?? []).map((r) => r.reservation_id),
    /^MANUAL-MT(\d+)$/
  );

  const year = new Date().getFullYear();
  const raPrefix = `RA-${year}-`;
  const { data: assignments } = await supabase
    .from("room_assignments")
    .select("room_assignment_id");
  let raMax = 0;
  for (const row of assignments ?? []) {
    const id = row.room_assignment_id;
    if (id.startsWith(raPrefix)) {
      const parsed = parseInt(id.slice(raPrefix.length), 10);
      if (!Number.isNaN(parsed)) raMax = Math.max(raMax, parsed);
    }
  }

  await Promise.all([
    supabase
      .from("import_sequences")
      .update({ current_value: rqMax, updated_at: new Date().toISOString() })
      .eq("key", "studio_rq"),
    supabase
      .from("import_sequences")
      .update({ current_value: mtMax, updated_at: new Date().toISOString() })
      .eq("key", "studio_mt"),
    supabase
      .from("import_sequences")
      .update({ current_value: manualMax, updated_at: new Date().toISOString() })
      .eq("key", "manual_mt"),
    supabase.from("import_sequences").upsert(
      {
        key: raSeqKey(year),
        current_value: raMax,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    ),
  ]);
}
