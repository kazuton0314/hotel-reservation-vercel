import { loadEnvLocal } from "./load-env";
import { backfillFormImportLog } from "@/lib/import/backfill-form-import-log";
import { createAdminClient } from "@/lib/supabase/server";

loadEnvLocal();

async function main() {
  const supabase = createAdminClient();
  const result = await backfillFormImportLog(supabase);
  console.log(
    `form_import_log: request ${result.request} 件 / studio ${result.studio} 件を登録しました`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
