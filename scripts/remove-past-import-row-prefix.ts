/**
 * 過去取込の import_row_id から "past:" 接頭辞を外す。
 *
 * - Dry run: npx tsx scripts/remove-past-import-row-prefix.ts
 * - Execute: npx tsx scripts/remove-past-import-row-prefix.ts --execute
 */
import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";

loadEnvLocal();

async function run() {
  const execute = process.argv.includes("--execute");
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("reservations")
    .select("reservation_id, import_source, import_row_id")
    .eq("import_source", "過去取込")
    .like("import_row_id", "past:%");
  if (error) throw error;

  const rows = data ?? [];
  console.log(`対象件数: ${rows.length}`);
  for (const r of rows.slice(0, 20)) {
    console.log(`${r.reservation_id}\t${r.import_row_id}`);
  }
  if (rows.length > 20) {
    console.log(`... (${rows.length - 20} more)`);
  }

  if (!execute) {
    console.log("\nDry run only. 実行するには --execute");
    return;
  }

  let updated = 0;
  for (const r of rows) {
    const current = String(r.import_row_id ?? "");
    const next = current.replace(/^past:/, "");
    if (!/^\d+$/.test(next)) {
      throw new Error(
        `数字行番号に変換できません: reservation=${r.reservation_id} import_row_id=${current}`
      );
    }
    const { error: updateError } = await supabase
      .from("reservations")
      .update({
        import_row_id: next,
        updated_at: new Date().toISOString(),
      })
      .eq("reservation_id", r.reservation_id);
    if (updateError) throw updateError;
    updated++;
  }

  console.log(`updated: ${updated}`);

  const { data: remain, error: remainError } = await supabase
    .from("reservations")
    .select("reservation_id")
    .eq("import_source", "過去取込")
    .like("import_row_id", "past:%")
    .limit(1);
  if (remainError) throw remainError;
  console.log(`remaining prefixed rows: ${(remain ?? []).length}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

