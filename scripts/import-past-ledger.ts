import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import {
  importPastLedger,
  printPastLedgerImportResult,
} from "@/lib/import/past-ledger-import";
import { finishImportJobRun, startImportJobRun } from "@/lib/ops/job-runs";

loadEnvLocal();

function usage(): never {
  console.error(`
使い方:
  npm run import:past-ledger -- [--dry-run] [--batch <id>] [--companions <csv>] <reservations.csv>

例:
  npm run import:past-ledger -- --dry-run ./data/my-2006.csv
  npm run import:past-ledger -- --batch 2006-v1 ./data/my-2006.csv
  npm run import:past-ledger -- --batch 2006-v1 --companions ./data/my-2006-companions.csv ./data/my-2006.csv

ポイント:
  - 本予約 CSV は data/templates/past-ledger-reservations.csv をコピーして使う
  - 取込キー（例: 2006-001）は人が付ける。同行者 CSV も同じキーで紐付ける
  - 部屋は「理科室,高学年室」のように1セルにカンマ区切り
  - 予約ID / 部屋割ID / 取込行ID は自動採番（既存 PAST データは変更しない）
  - チェックイン日 + 代表者名 + 電話番号 が既存と一致する行はスキップ
`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  let dryRun = false;
  let batchId = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let companionsPath: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--batch") {
      batchId = argv[++i];
      if (!batchId) usage();
      continue;
    }
    if (arg === "--companions") {
      companionsPath = argv[++i];
      if (!companionsPath) usage();
      continue;
    }
    positional.push(arg);
  }

  const reservationsPath = positional[0];
  if (!reservationsPath) usage();

  return { dryRun, batchId, companionsPath, reservationsPath };
}

async function main() {
  const { dryRun, batchId, companionsPath, reservationsPath } = parseArgs(
    process.argv.slice(2)
  );

  const supabase = createAdminClient();
  const runId = await startImportJobRun(supabase, "import-past-ledger", batchId);

  try {
    const result = await importPastLedger(supabase, reservationsPath, {
      batchId,
      dryRun,
      companionsPath,
    });

    await finishImportJobRun(supabase, runId, {
      status: "success",
      details: {
        reservationsPath,
        companionsPath,
        ...result,
        preview: result.preview.slice(0, 50),
      },
    });

    printPastLedgerImportResult(result);
    if (dryRun) {
      console.log("\nDry run のため DB には書き込んでいません。本番は --dry-run を外してください。");
    } else if (result.reservations.imported > 0) {
      console.log("\n顧客索引の更新: npm run rebuild:customers");
    }
  } catch (e) {
    await finishImportJobRun(supabase, runId, {
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
      details: { batchId, dryRun, reservationsPath, companionsPath },
    });
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
