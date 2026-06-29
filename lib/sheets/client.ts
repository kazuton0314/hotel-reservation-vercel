import { google } from "googleapis";

function getCredentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );
  if (!email || !privateKey) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY が未設定です"
    );
  }
  return { email, privateKey };
}

export function createSheetsClient() {
  const { email, privateKey } = getCredentials();
  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

export type SheetRow = {
  sheetRow: number;
  values: unknown[];
};

/** ヘッダー行（1行目）とデータ行（2行目〜）を取得 */
export async function fetchSheetRows(
  spreadsheetId: string,
  sheetName: string,
  dataColumnCount: number
): Promise<{ headers: string[]; rows: SheetRow[] }> {
  const sheets = createSheetsClient();
  const endCol = columnLetter(dataColumnCount);
  const range = `'${sheetName}'!A1:${endCol}`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const allRows = res.data.values ?? [];
  if (allRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = (allRows[0] ?? []).map((h) => String(h ?? "").trim());
  const rows: SheetRow[] = [];

  for (let i = 1; i < allRows.length; i++) {
    const raw = allRows[i] ?? [];
    const isEmpty = raw.every((c) => String(c ?? "").trim() === "");
    if (isEmpty) continue;
    rows.push({
      sheetRow: i + 1,
      values: raw,
    });
  }

  return { headers, rows };
}

function columnLetter(n: number): string {
  let result = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    num = Math.floor((num - 1) / 26);
  }
  return result;
}
