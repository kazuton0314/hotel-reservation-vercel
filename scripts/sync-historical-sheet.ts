import { cp, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { google } from "googleapis";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const year = arg("--year", process.argv[2]);
  const spreadsheetId = arg(
    "--spreadsheet-id",
    process.argv[3] ?? process.env.HISTORICAL_GUEST_SPREADSHEET_ID
  );
  const extractorRoot = path.resolve(
    arg("--extractor-root", path.join(process.cwd(), "..", "hotel-guest-form-extract"))!
  );
  const apply = process.argv.includes("--apply");
  if (!year || !/^\d{4}$/.test(year)) throw new Error("--year YYYY を指定してください");
  if (!spreadsheetId) throw new Error("--spreadsheet-id を指定してください");

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Googleサービスアカウント設定がありません");

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${year}'`,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const values = response.data.values ?? [];
  if (values.length < 2) throw new Error(`${year}シートにデータがありません`);

  const headers = values[0].map((value) => String(value ?? "").trim());
  const importKeyIndex = headers.indexOf("取込キー");
  if (importKeyIndex < 0) throw new Error("取込キーヘッダーがありません");
  const rows = values
    .slice(1)
    .filter((row) => String(row[importKeyIndex] ?? "").trim() !== "")
    .map((row) => headers.map((_, index) => row[index] ?? ""));
  const keys = rows.map((row) => String(row[importKeyIndex]).trim());
  if (new Set(keys).size !== keys.length) throw new Error("取込キーが重複しています");

  const outputDir = path.join(extractorRoot, "output");
  const recordsDir = path.join(outputDir, "records", year);
  const backupDir = apply
    ? path.join(outputDir, "backups", `before-sheet-sync-${year}-${timestamp()}`)
    : null;
  if (backupDir) {
    await mkdir(path.dirname(backupDir), { recursive: true });
    await cp(recordsDir, backupDir, { recursive: true, errorOnExist: true });
  }

  const syncDir = path.join(outputDir, "sheet-sync");
  await mkdir(syncDir, { recursive: true });
  const csvPath = path.join(syncDir, `review_${year}.csv`);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  await writeFile(csvPath, `\uFEFF${csv}`, "utf8");

  const runScript = path.join(extractorRoot, "run.ps1");
  const audit = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", runScript, "audit", csvPath],
    { cwd: extractorRoot, encoding: "utf8", stdio: "pipe" }
  );
  process.stdout.write(audit.stdout ?? "");
  process.stderr.write(audit.stderr ?? "");
  if (audit.status !== 0 && audit.status !== 2) {
    throw new Error(`事前監査に失敗しました (exit=${audit.status})`);
  }
  if (!apply) {
    console.log(JSON.stringify({ mode: "audit-only", year, rows: rows.length, csvPath, backupDir }, null, 2));
    return;
  }
  if (audit.status === 2) {
    throw new Error("問題候補が残っているためJSONへ書き戻しません。監査CSVを確認してください");
  }

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", runScript, "apply", csvPath],
    { cwd: extractorRoot, encoding: "utf8", stdio: "pipe" }
  );
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0) throw new Error(`JSON書き戻しに失敗しました (exit=${result.status})`);

  console.log(JSON.stringify({ mode: "applied", year, rows: rows.length, csvPath, backupDir }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
