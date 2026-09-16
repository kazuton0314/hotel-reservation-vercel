import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { google } from "googleapis";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
  const year = arg("--year", process.argv[2]);
  const spreadsheetId = arg("--spreadsheet-id", process.argv[3] ?? process.env.HISTORICAL_GUEST_SPREADSHEET_ID);
  const extractorRoot = path.resolve(arg("--extractor-root", path.join(process.cwd(), "..", "hotel-guest-form-extract"))!);
  if (!year || !/^\d{4}$/.test(year)) throw new Error("--year YYYY を指定してください");
  if (!spreadsheetId) throw new Error("--spreadsheet-id を指定してください");

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("Googleサービスアカウント設定がありません");

  const auth = new google.auth.JWT({ email, key: privateKey, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheets = google.sheets({ version: "v4", auth });

  const current = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${year}'`, valueRenderOption: "FORMATTED_VALUE" });
  const backupDir = path.join(extractorRoot, "output", "sheet-backups");
  await mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${year}-before-json-write-${timestamp()}.csv`);
  const backupCsv = (current.data.values ?? []).map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  await writeFile(backupPath, `\uFEFF${backupCsv}`, "utf8");

  const runScript = path.join(extractorRoot, "run.ps1");
  const exported = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", runScript, "export", "--year", year], { cwd: extractorRoot, encoding: "utf8", stdio: "pipe" });
  process.stdout.write(exported.stdout ?? "");
  process.stderr.write(exported.stderr ?? "");
  if (exported.status !== 0) throw new Error("JSONから校正CSVを生成できませんでした");

  const csvPath = path.join(extractorRoot, "output", `review_${year}.csv`);
  const values = parseCsv(await readFile(csvPath, "utf8"));
  if (values.length < 2) throw new Error("書き込むデータがありません");

  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${year}'` });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${year}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
  const verify = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${year}'!A1:A${values.length}` });
  if ((verify.data.values ?? []).length !== values.length) throw new Error("書込後の行数検証に失敗しました");
  console.log(JSON.stringify({ year, rows: values.length - 1, columns: values[0].length, backupPath, csvPath }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
