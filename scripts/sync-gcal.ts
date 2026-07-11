import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import {
  isGCalConfigured,
  syncAllActiveReservationsToGCal,
} from "@/lib/services/gcal-sync";

loadEnvLocal();

async function main() {
  if (!isGCalConfigured()) {
    console.error(`
Google カレンダーが未設定です。

.env.local に以下を設定してください:
  GOOGLE_CALENDAR_ID=xxxxxxxx@group.calendar.google.com
  GOOGLE_SERVICE_ACCOUNT_EMAIL=...
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"

カレンダー側でサービスアカウントに「変更権限」を付与してください。
`);
    process.exit(1);
  }

  const supabase = createAdminClient();
  const result = await syncAllActiveReservationsToGCal(supabase);
  console.log(`GCal同期: ${result.synced} 件`);
  if (result.errors.length) {
    console.log("エラー:");
    for (const e of result.errors) console.log(`  - ${e}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
