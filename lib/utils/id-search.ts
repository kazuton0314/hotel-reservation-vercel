/** 予約・リクエスト・顧客IDのプレフィックス検索 */

const ID_PREFIX_PATTERN =
  /^(STUDIO-RQ|STUDIO-MT|STUDIO|MANUAL-MT|MANUAL|PAST|MIG-MT|MIG-RQ|MIG|CU|CK|RA)(-|$)/i;

/** 検索語をID比較用に正規化（大文字・前後空白除去） */
export function normalizeIdQuery(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * 人名ではなく ID らしい入力か（ASCII + 数字 + ハイフンのみ、既知プレフィックス）
 */
export function isIdLikeQuery(raw: string): boolean {
  const q = normalizeIdQuery(raw);
  if (!q) return false;
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(q)) return false;
  return ID_PREFIX_PATTERN.test(q);
}

/** ID のプレフィックス一致（MANUAL → MANUAL-*、MANUAL-MT1 → MANUAL-MT1*） */
export function matchesIdPrefix(
  id: string | null | undefined,
  rawQuery: string
): boolean {
  const q = normalizeIdQuery(rawQuery);
  if (!q) return true;
  const normalizedId = normalizeIdQuery(String(id ?? ""));
  if (!normalizedId) return false;
  return normalizedId.startsWith(q);
}

/** ID の完全一致（大文字小文字無視） */
export function matchesIdExact(
  id: string | null | undefined,
  rawQuery: string
): boolean {
  const q = normalizeIdQuery(rawQuery);
  if (!q) return false;
  return normalizeIdQuery(String(id ?? "")) === q;
}

/** Supabase ilike 用: プレフィックス検索パターン（% は付けない） */
export function idPrefixIlikePattern(raw: string): string {
  return normalizeIdQuery(raw).replace(/[%_\\]/g, "");
}
