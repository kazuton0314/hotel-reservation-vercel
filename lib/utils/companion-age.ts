const MIN_AGE = 0;
const MAX_AGE = 120;

/** 入力から数字のみ抽出（「32歳」→「32」） */
export function normalizeCompanionAgeInput(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n)) return "";
  return String(Math.min(MAX_AGE, Math.max(MIN_AGE, n)));
}

export function validateCompanionAge(raw: string): string | null {
  const normalized = normalizeCompanionAgeInput(raw);
  if (!normalized) {
    return raw.trim() ? "年齢は0〜120の数字で入力してください。" : null;
  }
  const n = Number(normalized);
  if (n < MIN_AGE || n > MAX_AGE) {
    return "年齢は0〜120の数字で入力してください。";
  }
  return null;
}

export function formatCompanionAgeDisplay(raw: string | null | undefined): string {
  const normalized = normalizeCompanionAgeInput(String(raw ?? ""));
  if (!normalized) return "";
  return `${normalized}歳`;
}
