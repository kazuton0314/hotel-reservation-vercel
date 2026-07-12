import { loadEnvLocal } from "./load-env";
import { restoreRequestsFromCsv } from "@/lib/import/restore-requests";
import { createAdminClient } from "@/lib/supabase/server";

loadEnvLocal();

async function main() {
  const [, , goodCsvPath, badCsvPath] = process.argv;

  if (!goodCsvPath) {
    console.error(`
使い方:
  npm run restore:requests -- <正しいCSV> [誤って増えたCSV]

対応形式:
  - Supabase エクスポート（request_id 列）… reservation_requests_rows_before.csv など
  - 02_予約リクエスト台帳 CSV（リクエストID 列）

例:
  npm run restore:requests -- ./data/reservation_requests_rows_before.csv ./data/reservation_requests_rows_after.csv
  npm run restore:requests -- ./data/02_予約リクエスト台帳.csv

手順（自動）:
  1. 誤増 ID の削除（badCsv 指定時）
  2. 正 CSV で upsert（status / linked_reservation_id / access_key を含む）
  3. reservations.request_id の双方向修復
  4. アーカイブ本予約との事後リンク
  5. form_import_log backfill（request + studio）
  6. STUDIO-RQ 連番再同期
`);
    process.exit(1);
  }

  const supabase = createAdminClient();
  const result = await restoreRequestsFromCsv(supabase, goodCsvPath, badCsvPath);

  console.log(`削除: ${result.deleted} 件`);
  console.log(`復元 upsert: ${result.upserted} 件`);
  console.log(
    `form_import_log: request ${result.backfill.request} / studio ${result.backfill.studio} 件`
  );
  console.log(`予約側 request_id 修復: ${result.repaired} 件`);
  console.log(`アーカイブ含む事後リンク: ${result.archivedLinked} 件`);
  console.log(`未承認リクエスト（リクエスト）: ${result.pendingOpenRequests} 件`);

  if (result.brokenLinks.length > 0) {
    console.log("連携先が見つからない linked_reservation_id:");
    for (const line of result.brokenLinks) console.log(`  - ${line}`);
  } else {
    console.log("linked_reservation_id の参照切れ: なし");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
