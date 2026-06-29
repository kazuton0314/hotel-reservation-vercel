import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import { importCsvFile, type CsvImportTarget } from "@/lib/import/csv-import";

loadEnvLocal();

const TARGETS: Record<string, CsvImportTarget> = {
  "reservations-active": "reservations-active",
  "reservations-archive": "reservations-archive",
  "requests-active": "requests-active",
  "requests-archive": "requests-archive",
  "room-assignments-active": "room-assignments-active",
  "room-assignments-archive": "room-assignments-archive",
};

async function main() {
  const [, , targetArg, filePath] = process.argv;

  if (!targetArg || !filePath || !(targetArg in TARGETS)) {
    console.error(`
使い方:
  npm run import:csv -- <target> <csvファイルパス>

target:
  reservations-active      … 03_予約台帳
  reservations-archive     … 07_予約台帳_アーカイブ
  requests-active          … 02_予約リクエスト台帳
  requests-archive         … 06_予約リクエスト台帳_アーカイブ
  room-assignments-active  … 04_部屋割り
  room-assignments-archive … 08_部屋割り_アーカイブ

例:
  npm run import:csv -- reservations-active ./data/03_予約台帳.csv
`);
    process.exit(1);
  }

  const supabase = createAdminClient();
  const target = TARGETS[targetArg];
  const result = await importCsvFile(supabase, target, filePath);

  console.log(`完了: ${target}`);
  console.log(`  投入: ${result.imported} 件`);
  console.log(`  スキップ: ${result.skipped} 件`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
