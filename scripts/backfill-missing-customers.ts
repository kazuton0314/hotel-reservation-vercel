/**
 * customer_id 未設定の予約へ顧客索引を安全に付与する。
 *
 * 既定は STUDIO（本予約フォーム）のみ・dry-run。
 *
 * Dry run:  npx tsx scripts/backfill-missing-customers.ts
 * Execute:  npx tsx scripts/backfill-missing-customers.ts --execute
 * 全ソース: npx tsx scripts/backfill-missing-customers.ts --all-sources --execute
 */
import { loadEnvLocal } from "./load-env";
loadEnvLocal();
import { createAdminClient } from "@/lib/supabase/server";
import { backfillMissingCustomers } from "@/lib/import/backfill-missing-customers";

async function main() {
  const execute = process.argv.includes("--execute");
  const allSources = process.argv.includes("--all-sources");
  const supabase = createAdminClient();

  const result = await backfillMissingCustomers(supabase, {
    dryRun: !execute,
    importSources: allSources ? undefined : ["STUDIO"],
  });

  console.log(
    `mode=${result.dryRun ? "dry-run" : "execute"} sources=${
      allSources ? "ALL" : "STUDIO"
    }`
  );
  console.log(`candidates: ${result.candidates.length}`);
  console.table(
    result.candidates.map((c) => ({
      id: c.reservation_id,
      src: c.import_source,
      name: c.representative_name,
      check_in: c.check_in,
      status: c.status,
      key: c.customer_key,
    }))
  );

  if (result.dryRun) {
    console.log("\nDry run only. 実行するには --execute");
    return;
  }

  console.log(`\nlinked: ${result.linked.length}`);
  console.table(result.linked);
  if (result.errors.length) {
    console.log(`errors: ${result.errors.length}`);
    console.table(result.errors);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
