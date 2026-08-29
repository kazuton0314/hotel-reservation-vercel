import { randomUUID } from "crypto";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * 予約の access_key を決定する。
 * 既存キー（メール送信済みリンク等）を最優先し、空のときだけ incoming を採用する。
 */
export function resolvePreservedAccessKey(
  existing: string | null | undefined,
  incoming: string | null | undefined
): string | null {
  const current = String(existing ?? "").trim();
  if (current) return current;
  const next = String(incoming ?? "").trim();
  return next || null;
}

/** GAS generateAccessKey_ 相当（XXXX-XXXX） */
export function generateAccessKey(): string {
  const uuid = randomUUID().replace(/-/g, "").toUpperCase();
  let result = "";
  let uuidIdx = 0;
  for (let i = 0; i < 8; i++) {
    const charCode = parseInt(uuid.slice(uuidIdx, uuidIdx + 2), 16);
    uuidIdx += 2;
    result += CHARS[charCode % CHARS.length];
  }
  return `${result.slice(0, 4)}-${result.slice(4)}`;
}
