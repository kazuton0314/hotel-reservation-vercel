import { loadEnvLocal } from "./load-env";
import { loadFormCsv } from "@/lib/import/form-csv";
import {
  importRequestFormRows,
  importStudioFormRows,
} from "@/lib/import/sync-forms";
import { linkExistingRequestsAndReservations } from "@/lib/import/post-link";
import { createAdminClient } from "@/lib/supabase/server";
import { finishImportJobRun, startImportJobRun } from "@/lib/ops/job-runs";

loadEnvLocal();

const TARGETS = {
  request: "request",
  studio: "studio",
} as const;

function printResult(
  result: Awaited<ReturnType<typeof importRequestFormRows>>
) {
  console.log(`  投入: ${result.imported} 件`);
  console.log(`  スキップ: ${result.skipped} 件`);
  if (result.skippedAlreadyLogged > 0) {
    console.log(`    └ 取込済み（form_import_log）: ${result.skippedAlreadyLogged} 件`);
  }
  if (result.skippedAlreadyInDb > 0) {
    console.log(`    └ DB既存（上書き回避）: ${result.skippedAlreadyInDb} 件`);
  }
  if (result.skippedNotImportable > 0) {
    console.log(`    └ 取込条件不足: ${result.skippedNotImportable} 件`);
  }
  if (result.errors.length) {
    console.log(`  エラー: ${result.errors.length} 件`);
    for (const err of result.errors) console.log(`    - ${err}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const reimport =
    args.includes("--reimport") ||
    args.some((a) => a.toLowerCase() === "reimport");
  const positional = args.filter(
    (a) => a !== "--reimport" && a.toLowerCase() !== "reimport"
  );
  const [targetArg, filePath] = positional;

  if (!targetArg || !filePath || !(targetArg in TARGETS)) {
    console.error(`
使い方:
  npm run import:forms-csv -- <target> <csvファイルパス> [reimport]

target:
  request  … 予約リクエストフォーム回答（GoogleフォームCSV）
  studio   … 本予約（STUDIO）フォーム回答（GoogleフォームCSV）

オプション:
  reimport（3番目の引数）… 取込済み行も再投入（npm では --reimport が効かないため）

例:
  npm run import:forms-csv -- request "./data/予約リクエストテストフォーム - シート1.csv"
  npm run import:forms-csv -- studio "./data/本予約テストフォーム - シート1.csv" reimport

  # 直接実行なら --reimport も可
  npx tsx scripts/import-forms-csv.ts request "./data/....csv" --reimport

診断:
  npm run check:form-import

注意:
  - 台帳形式（02_/03_）ではなく、フォーム回答形式のCSVです
  - 2回目以降は通常スキップされます（--force で再投入可）
  - リクエスト→本予約の紐づけ確認は npm run link:records を実行
`);
    process.exit(1);
  }

  const supabase = createAdminClient();
  const target = targetArg as keyof typeof TARGETS;
  const runId = await startImportJobRun(supabase, "import-forms-csv", target);

  try {
    const { headers, rows } = loadFormCsv(filePath);
    if (!headers.length || !rows.length) {
      throw new Error("CSVにデータ行がありません");
    }

    if (reimport) {
      console.log("※ reimport: 取込済み行も再投入します");
    }

    const result =
      target === "request"
        ? await importRequestFormRows(supabase, headers, rows, { force: reimport })
        : await importStudioFormRows(supabase, headers, rows, { force: reimport });

    let postLink: {
      linked: number;
      repaired: number;
      skipped: number;
      errors: string[];
    } | null = null;
    if (target === "studio") {
      postLink = await linkExistingRequestsAndReservations(supabase);
    }

    await finishImportJobRun(supabase, runId, {
      status: "success",
      details: { target, filePath, reimport, ...result, postLink },
    });

    console.log(`完了: ${target}`);
    printResult(result);

    if (
      !reimport &&
      result.imported === 0 &&
      result.skippedAlreadyLogged > 0
    ) {
      console.log("");
      console.log(
        "ヒント: 既に取込済みのためスキップされています。再投入する場合は末尾に reimport を付けて実行してください。"
      );
      console.log(
        '      例: npm run import:forms-csv -- request "./data/....csv" reimport'
      );
      console.log("      状態確認: npm run check:form-import");
    }

    if (postLink) {
      console.log(`  事後リンク: ${postLink.linked} 件`);
      if (postLink.repaired > 0) {
        console.log(`  双方向修復: ${postLink.repaired} 件`);
      }
    }
  } catch (e) {
    await finishImportJobRun(supabase, runId, {
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
      details: { target, filePath, reimport },
    });
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
