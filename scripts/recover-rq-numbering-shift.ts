/**
 * 同一内容リクエストの二重送信で RQ 採番が 1 つずつずれる問題を復旧する。
 *
 * Dry run:
 *   npx tsx scripts/recover-rq-numbering-shift.ts
 *
 * Execute:
 *   npx tsx scripts/recover-rq-numbering-shift.ts --execute
 *
 * 手動で対象行を指定:
 *   npx tsx scripts/recover-rq-numbering-shift.ts --duplicate-row 61
 */
import { loadEnvLocal } from "./load-env";
import {
  auditRqNumberingShift,
  recoverRqNumberingShift,
} from "@/lib/import/recover-rq-numbering-shift";
import { createAdminClient } from "@/lib/supabase/server";

loadEnvLocal();

function parseArgs(argv: string[]) {
  let execute = false;
  let duplicateRow: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--execute") execute = true;
    if (arg === "--duplicate-row") {
      duplicateRow = parseInt(argv[++i] ?? "", 10);
    }
  }
  return { execute, duplicateRow };
}

async function main() {
  const { execute, duplicateRow } = parseArgs(process.argv.slice(2));
  const supabase = createAdminClient();

  console.log(execute ? "*** 本番復旧モード ***" : "*** Dry Run ***");

  const audit = await auditRqNumberingShift(supabase, {
    duplicateRow,
    expectedLatest: { lastName: "河合", firstName: "怜治", expectedRq: 68 },
  });

  console.log("\n=== 重複ログ (同一 request_id ← 複数 source_row) ===");
  for (const dup of audit.duplicateLogs) {
    console.log(
      `  ${dup.requestId} rows=[${dup.sourceRows.join(", ")}] first=${dup.firstRow} dupRow=${dup.duplicateRow}`
    );
  }

  console.log("\n=== 選択された復旧対象 ===");
  console.log(audit.selected ?? "(なし)");
  console.log(`shiftFrom: ${audit.shiftFromRq != null ? `STUDIO-RQ${audit.shiftFromRq}` : "—"}`);
  console.log(`currentMax: ${audit.currentMaxRq != null ? `STUDIO-RQ${audit.currentMaxRq}` : "—"}`);
  console.log(`latest ${audit.expectedLatest.lastName} ${audit.expectedLatest.firstName}:`, audit.latestMatch);

  if (audit.missingImport) {
    console.log("\n=== 穴埋め投入 ===");
    console.log(audit.missingImport);
  }

  if (audit.renames.length) {
    console.log("\n=== リネーム予定 ===");
    for (const row of audit.renames) {
      console.log(`  ${row.from} → ${row.to}`);
    }
  }

  if (audit.warnings.length) {
    console.log("\n=== 警告 ===");
    for (const w of audit.warnings) console.log(`  - ${w}`);
  }

  if (!audit.selected) {
    console.log("\n復旧対象なし。終了。");
    return;
  }

  const result = await recoverRqNumberingShift(supabase, {
    dryRun: !execute,
    duplicateRow,
    expectedLatest: { lastName: "河合", firstName: "怜治", expectedRq: 68 },
  });

  console.log("\n=== 結果 ===");
  console.log(JSON.stringify(result, null, 2));

  if (!execute) {
    console.log("\n実行するには --execute を付けて再実行してください。");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
