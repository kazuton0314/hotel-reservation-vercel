/**
 * 過去取込(PAST)の import_row_id が現行フォーム行番号と衝突している問題を解消する。
 *
 * npx tsx scripts/fix-past-import-row-collision.ts
 * npx tsx scripts/fix-past-import-row-collision.ts --execute
 */
import { loadEnvLocal } from "./load-env";
loadEnvLocal();
import { createAdminClient } from "@/lib/supabase/server";

async function main() {
  const execute = process.argv.includes("--execute");
  const supabase = createAdminClient();

  const { data: pastLogs, error: logErr } = await supabase
    .from("form_import_log")
    .select("id, source_row, reservation_id")
    .eq("source", "studio")
    .like("reservation_id", "PAST-%");
  if (logErr) throw logErr;

  const { data: pastRows, error: pastErr } = await supabase
    .from("reservations")
    .select("reservation_id, import_row_id")
    .eq("import_source", "過去取込")
    .not("import_row_id", "is", null);
  if (pastErr) throw pastErr;

  const toRename = (pastRows ?? []).filter((r) => {
    const id = String(r.import_row_id ?? "");
    return /^\d+$/.test(id);
  });

  console.log(`form_import_log studio→PAST: ${pastLogs?.length ?? 0} 件`);
  for (const l of pastLogs ?? []) {
    console.log(`  row ${l.source_row} → ${l.reservation_id}`);
  }
  console.log(`PAST import_row_id を past:N に改名: ${toRename.length} 件`);

  if (!execute) {
    console.log("\nDry run。実行するには --execute");
    return;
  }

  if ((pastLogs ?? []).length > 0) {
    const { error } = await supabase
      .from("form_import_log")
      .delete()
      .eq("source", "studio")
      .like("reservation_id", "PAST-%");
    if (error) throw error;
    console.log(`deleted ${pastLogs!.length} form_import_log rows`);
  }

  let renamed = 0;
  for (const row of toRename) {
    const nextId = `past:${row.import_row_id}`;
    const { error } = await supabase
      .from("reservations")
      .update({
        import_row_id: nextId,
        updated_at: new Date().toISOString(),
      })
      .eq("reservation_id", row.reservation_id);
    if (error) throw error;
    renamed++;
  }
  console.log(`renamed ${renamed} PAST import_row_id`);
  console.log("完了。手動フォーム同期を再実行してください。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
