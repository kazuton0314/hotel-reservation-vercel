import { loadEnvLocal } from "./load-env";
import {
  linkArchivedRequestsToReservations,
  linkExistingRequestsAndReservations,
} from "@/lib/import/post-link";
import { finishImportJobRun, startImportJobRun } from "@/lib/ops/job-runs";
import { createAdminClient } from "@/lib/supabase/server";

loadEnvLocal();

async function main() {
  const supabase = createAdminClient();
  const runId = await startImportJobRun(supabase, "link-existing", "requests-reservations");
  try {
    const active = await linkExistingRequestsAndReservations(supabase);
    const archived = await linkArchivedRequestsToReservations(supabase);
    const result = {
      activeLinked: active.linked,
      archivedLinked: archived.linked,
      repaired: active.repaired + archived.repaired,
      skipped: active.skipped + archived.skipped,
      errors: [...active.errors, ...archived.errors],
    };
    await finishImportJobRun(supabase, runId, { status: "success", details: result });
    console.log("完了: request-reservation post link");
    console.log(`  アクティブ連携: ${result.activeLinked} 件`);
    console.log(`  アーカイブ連携: ${result.archivedLinked} 件`);
    console.log(`  双方向修復: ${result.repaired} 件`);
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
