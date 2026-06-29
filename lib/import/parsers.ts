import { randomBytes } from "crypto";

const ACCESS_KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function asTextField(value: unknown): string {
  if (value === "" || value == null) return "";
  return String(value).trim();
}

export function asPhoneString(value: unknown): string {
  if (value === "" || value == null) return "";
  if (typeof value === "number") {
    return String(Math.trunc(value));
  }
  return String(value).trim();
}

export function isTruthyFlag(value: unknown): boolean {
  if (value === true) return true;
  const s = String(value ?? "").trim();
  if (!s) return false;
  const upper = s.toUpperCase();
  return upper === "TRUE" || s === "済" || s === "取込済" || upper === "1";
}

/** GAS generateAccessKey_ 相当 */
export function generateAccessKey(): string {
  const bytes = randomBytes(8);
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += ACCESS_KEY_CHARS[bytes[i] % ACCESS_KEY_CHARS.length];
  }
  return `${result.slice(0, 4)}-${result.slice(4)}`;
}

export function rowToRecord(
  headers: string[],
  values: unknown[]
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  headers.forEach((header, i) => {
    if (header) record[header] = values[i] ?? "";
  });
  return record;
}

export function headerIndex(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (h) map[h.trim()] = i;
  });
  return map;
}

export function getCell(
  values: unknown[],
  index: Record<string, number>,
  key: string
): unknown {
  const i = index[key];
  if (i === undefined) return "";
  return values[i] ?? "";
}
