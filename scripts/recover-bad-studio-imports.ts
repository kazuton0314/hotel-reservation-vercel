/**
 * 障害取込の復旧
 *
 * npm run recover:bad-studio-imports -- --dry-run
 * npm run recover:bad-studio-imports -- --execute
 */
import { loadEnvLocal } from "./load-env";
import {
  listCorruptedStudioImports,
  recoverBadStudioImports,
} from "@/lib/import/recover-bad-studio-imports";
import { createAdminClient } from "@/lib/supabase/server";

loadEnvLocal();

async function main() {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;

  if (execute) {
    console.log("*** 本番復旧モード: DB と GCal を変更します ***");
  } else {
    console.log("*** Dry Run: 変更は行いません ***");
  }

  const supabase = createAdminClient();
  const preview = await listCorruptedStudioImports(supabase);
  console.log(`削除対象: ${preview.length} 件`);
  for (const row of preview) {
    console.log(`  - ${row.reservation_id} (${row.representative_name}, ${row.check_in})`);
  }

  const result = await recoverBadStudioImports(supabase, { dryRun });
  console.log("\n=== 結果 ===");
  console.log(JSON.stringify(result, null, 2));

  if (dryRun) {
    console.log("\n実行するには:");
    console.log("  npm run recover:bad-studio-imports -- --execute");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
