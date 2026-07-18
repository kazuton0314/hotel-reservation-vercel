/**
 * 障害取込の監査（Dry Run 専用・DB変更なし）
 *
 * npm run audit:bad-studio-imports
 */
import { loadEnvLocal } from "./load-env";
import {
  BAD_IMPORT_MT_FLOOR,
  listCorruptedStudioImports,
} from "@/lib/import/recover-bad-studio-imports";
import { createAdminClient } from "@/lib/supabase/server";

loadEnvLocal();

async function main() {
  const supabase = createAdminClient();
  const bad = await listCorruptedStudioImports(supabase);

  console.log(`=== 障害取込監査 (STUDIO-MT${BAD_IMPORT_MT_FLOOR}+ / composite import_row_id) ===`);
  console.log(`対象件数: ${bad.length}`);
  console.log("");

  for (const row of bad) {
    console.log(
      [
        row.reservation_id,
        `import_row_id=${row.import_row_id ?? ""}`,
        row.representative_name ?? "",
        row.check_in ?? "",
        `request=${row.request_id ?? ""}`,
        `gcal=${row.gcal_event_id ? "yes" : "no"}`,
        `[${row.reason.join(", ")}]`,
      ].join(" | ")
    );
  }

  const byImportRow = new Map<string, string[]>();
  for (const row of bad) {
    const key = row.import_row_id ?? "";
    if (!byImportRow.has(key)) byImportRow.set(key, []);
    byImportRow.get(key)!.push(row.reservation_id);
  }

  console.log("\n=== 同一 import_row_id の重複 ===");
  for (const [k, ids] of byImportRow) {
    if (ids.length > 1) console.log(`${k} -> ${ids.join(", ")}`);
  }

  console.log("\n次のステップ:");
  console.log("  npm run recover:bad-studio-imports -- --dry-run");
  console.log("  npm run recover:bad-studio-imports -- --execute");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
