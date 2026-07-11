import { randomUUID } from "crypto";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
