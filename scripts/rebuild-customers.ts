/**
 * Backfill customers table from existing reservations.
 * Usage: npx tsx scripts/rebuild-customers.ts
 */
import { loadEnvLocal } from "./load-env";
import { rebuildAllCustomers } from "../lib/services/customer-index";
import { finishImportJobRun, startImportJobRun } from "../lib/ops/job-runs";
import { createAdminClient } from "../lib/supabase/server";

loadEnvLocal();

async function main() {
  const supabase = createAdminClient();
  const runId = await startImportJobRun(supabase, "rebuild-customers", "customers");
  try {
    const count = await rebuildAllCustomers(supabase);
    await finishImportJobRun(supabase, runId, {
      status: "success",
      details: { count },
    });
    console.log(`Rebuilt ${count} customer records.`);
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
