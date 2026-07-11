/** 一覧検索（本予約・リクエスト）— GAS listSearch 相当 */

import {
  isIdLikeQuery,
  matchesIdPrefix,
} from "@/lib/utils/id-search";

const KATA_TO_HIRA: Record<string, string> = {};
const HIRA_TO_KATA: Record<string, string> = {};
for (let i = 0; i < 83; i++) {
  const hira = String.fromCharCode(0x3041 + i);
  const kata = String.fromCharCode(0x30a1 + i);
  KATA_TO_HIRA[kata] = hira;
  HIRA_TO_KATA[hira] = kata;
}

export function normalizeKana(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .split("")
    .map((ch) => KATA_TO_HIRA[ch] ?? ch)
    .join("");
}

export function normalizeSearchText(input: string): string {
  return normalizeKana(input.trim().toLowerCase());
}

function digitsOnly(input: string): string {
  return input.replace(/[^\d]/g, "");
}

export type ListSearchFields = {
  id?: string | null;
  representative_name?: string | null;
  name_kana?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  last_name_kana?: string | null;
  first_name_kana?: string | null;
  group_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

function nameLikeTexts(item: ListSearchFields): string[] {
  return [
    item.representative_name,
    item.name_kana,
    item.last_name,
    item.first_name,
    item.last_name_kana,
    item.first_name_kana,
    item.group_name,
    item.email,
    item.phone,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}

/**
 * キーワード一致
 * - IDらしい入力 → 予約/リクエストIDのプレフィックス一致のみ
 * - それ以外 → 名前・メール・電話などの部分一致（IDは見ない）
 */
export function matchesListKeyword(
  item: ListSearchFields,
  rawKeyword: string | undefined
): boolean {
  const keyword = String(rawKeyword ?? "").trim();
  if (!keyword) return true;

  if (isIdLikeQuery(keyword)) {
    return matchesIdPrefix(item.id, keyword);
  }

  const normKeyword = normalizeSearchText(keyword);
  const digitKeyword = digitsOnly(keyword);

  for (const text of nameLikeTexts(item)) {
    const normText = normalizeSearchText(text);
    if (normText.includes(normKeyword)) return true;

    if (digitKeyword.length >= 2) {
      const normDigits = digitsOnly(text);
      if (normDigits.includes(digitKeyword)) return true;
      if (normText.replace(/[^\da-z]/gi, "").includes(digitKeyword)) return true;
    }
  }
  return false;
}

export function matchesCheckInDate(
  checkIn: string | null | undefined,
  filterDate: string | undefined
): boolean {
  const d = String(filterDate ?? "").trim();
  if (!d) return true;
  return String(checkIn ?? "").slice(0, 10) === d;
}

export function filterListBySearch<
  T extends ListSearchFields & { check_in?: string | null },
>(items: T[], q?: string, checkIn?: string): T[] {
  return items.filter(
    (item) =>
      matchesListKeyword(item, q) &&
      matchesCheckInDate(item.check_in, checkIn)
  );
}
