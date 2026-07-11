import { readFileSync } from "fs";
import type { SheetRow } from "@/lib/sheets/client";

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }

  return rows;
}

/** Googleフォーム回答CSV（1行目ヘッダー）を sync-forms と同じ形式に変換 */
export function loadFormCsv(filePath: string): {
  headers: string[];
  rows: SheetRow[];
} {
  const raw = readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const table = parseCsv(raw);
  if (table.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = table[0].map((h) => String(h ?? "").trim());
  const rows: SheetRow[] = [];

  for (let i = 1; i < table.length; i++) {
    const values = table[i] ?? [];
    const isEmpty = values.every((c) => String(c ?? "").trim() === "");
    if (isEmpty) continue;

    rows.push({
      sheetRow: i + 1,
      values: values.map((c) => {
        const s = String(c ?? "").trim();
        return s === "" ? null : s;
      }),
    });
  }

  return { headers, rows };
}
