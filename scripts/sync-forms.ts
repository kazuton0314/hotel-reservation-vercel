import { loadEnvLocal } from "./load-env";
import { syncAllForms } from "@/lib/import/sync-forms";
import { createAdminClient } from "@/lib/supabase/server";
import { isGoogleSheetsReady } from "@/lib/setup/env";

loadEnvLocal();

async function main() {
  if (!isGoogleSheetsReady()) {
    console.error(`
Google サービスアカウントが未設定です。

1. docs/SETUP-YOUR-TASKS.md の手順に従う
2. .env.local に GOOGLE_SERVICE_ACCOUNT_EMAIL / PRIVATE_KEY を追加
3. npm run check:setup で確認
`);
    process.exit(1);
  }

  const supabase = createAdminClient();
  const result = await syncAllForms(supabase);

  console.log("フォーム取込完了");
  console.log("  リクエスト:", result.request);
  console.log("  STUDIO本予約:", result.studio);
  console.log("  事後リンク:", result.postLink);
  console.log("  sync_run ID:", result.runId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
