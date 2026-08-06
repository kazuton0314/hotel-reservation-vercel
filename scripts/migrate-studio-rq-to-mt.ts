/**
 * import_source=STUDIO なのに STUDIO-RQ* になっている予約を
 * STUDIO-MT* へ移し替える（参照先も追随更新）。
 *
 * Dry run: npx tsx scripts/migrate-studio-rq-to-mt.ts
 * Execute: npx tsx scripts/migrate-studio-rq-to-mt.ts --execute
 */
import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import {
  nextStudioReservationId,
  syncSequencesFromLedger,
} from "@/lib/import/id-generation";

loadEnvLocal();

type ReservationRow = Record<string, unknown> & {
  reservation_id: string;
  import_source: string | null;
  import_row_id: string | null;
  request_id: string | null;
  representative_name: string | null;
  check_in: string | null;
};

async function run() {
  const execute = process.argv.includes("--execute");
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("import_source", "STUDIO")
    .like("reservation_id", "STUDIO-RQ%")
    .order("import_row_id", { ascending: true });
  if (error) throw error;
  const targets = (data ?? []) as ReservationRow[];

  console.log(`対象件数: ${targets.length}`);
  for (const t of targets) {
    console.log(
      `${t.reservation_id}\trow=${t.import_row_id ?? ""}\t${t.representative_name ?? ""}\t${t.check_in ?? ""}`
    );
  }

  if (!execute) {
    console.log("\nDry run only. 実行するには --execute");
    return;
  }

  const moved: Array<{ from: string; to: string; row: string | null }> = [];

  for (const oldRow of targets) {
    const newId = await nextStudioReservationId(supabase);
    const now = new Date().toISOString();

    const inserted = {
      ...oldRow,
      reservation_id: newId,
      updated_at: now,
    };

    const { error: insError } = await supabase
      .from("reservations")
      .insert(inserted);
    if (insError) throw insError;

    const { error: reqLinkError } = await supabase
      .from("reservation_requests")
      .update({ linked_reservation_id: newId, updated_at: now })
      .eq("linked_reservation_id", oldRow.reservation_id);
    if (reqLinkError) throw reqLinkError;

    const { error: raError } = await supabase
      .from("room_assignments")
      .update({ reservation_id: newId, updated_at: now })
      .eq("reservation_id", oldRow.reservation_id);
    if (raError) throw raError;

    const { error: compError } = await supabase
      .from("companions")
      .update({ reservation_id: newId, updated_at: now })
      .eq("reservation_id", oldRow.reservation_id);
    if (compError) throw compError;

    const { error: logError } = await supabase
      .from("form_import_log")
      .update({ reservation_id: newId, imported_at: now })
      .eq("reservation_id", oldRow.reservation_id)
      .eq("source", "studio");
    if (logError) throw logError;

    const { error: mailError } = await supabase
      .from("mail_logs")
      .update({ entity_id: newId })
      .eq("entity_type", "reservation")
      .eq("entity_id", oldRow.reservation_id);
    if (mailError) {
      // mail_logs がない環境でも本体移行を止めない
      console.warn(`warn: mail_logs update failed for ${oldRow.reservation_id}: ${mailError.message}`);
    }

    const { error: delError } = await supabase
      .from("reservations")
      .delete()
      .eq("reservation_id", oldRow.reservation_id);
    if (delError) throw delError;

    moved.push({
      from: oldRow.reservation_id,
      to: newId,
      row: oldRow.import_row_id,
    });
  }

  await syncSequencesFromLedger(supabase);
  const { data: seq, error: seqErr } = await supabase
    .from("import_sequences")
    .select("current_value")
    .eq("key", "studio_mt")
    .single();
  if (seqErr) throw seqErr;

  console.log("\n移行結果:");
  for (const m of moved) {
    console.log(`${m.from} -> ${m.to} (row=${m.row ?? ""})`);
  }
  console.log(`studio_mt current_value=${seq.current_value} (next should be ${Number(seq.current_value) + 1})`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

