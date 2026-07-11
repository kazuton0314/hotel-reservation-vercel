import { loadEnvLocal } from "./load-env";
import { linkExistingRequestsAndReservations } from "@/lib/import/post-link";
import { finishImportJobRun, startImportJobRun } from "@/lib/ops/job-runs";
import { createAdminClient } from "@/lib/supabase/server";

loadEnvLocal();

async function main() {
  const supabase = createAdminClient();
  const runId = await startImportJobRun(supabase, "link-existing", "requests-reservations");
  try {
    const result = await linkExistingRequestsAndReservations(supabase);
    await finishImportJobRun(supabase, runId, { status: "success", details: result });
    console.log("完了: request-reservation post link");
    console.log(`  連携: ${result.linked} 件`);
    console.log(`  スキップ: ${result.skipped} 件`);
    if (result.errors.length) {
      console.log("  エラー:");
      for (const e of result.errors) console.log(`    - ${e}`);
    }
  } catch (e) {
    await finishImportJobRun(supabase, runId, {
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
