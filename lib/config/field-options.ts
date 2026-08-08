/**
 * STUDIO フォーム / GAS ClientCore.html と同一の選択肢
 * @see hotel-reservation-gas/ClientCore.html
 * @see hotel-reservation-gas/Config.js initialMaster
 */

export const RESERVATION_STATUS_OPTIONS = [
  "仮予約",
  "確定",
  "キャンセル",
] as const;

export const REQUEST_STATUS_EDIT_OPTIONS = [
  "リクエスト",
  "承認済",
  "却下",
] as const;

export const CHANNEL_OPTIONS = [
  "自社サイト",
  "Airbnb",
  "電話",
  "その他",
  "代入力",
] as const;

export const MANUAL_CHANNEL_OPTIONS = CHANNEL_OPTIONS;

export const GROUP_TYPE_OPTIONS = [
  "家族",
  "友人",
  "企業",
  "学生",
  "団体",
  "サークル",
  "その他",
] as const;

export const PHONE_AVAILABLE_OPTIONS = [
  "午前中",
  "12:00~15:00",
  "15:00~18:00",
  "18:00~21:00",
] as const;

export const TRANSPORT_OPTIONS = [
  "車",
  "バイク",
  "自転車",
  "電車",
  "バス",
  "その他",
] as const;

export const TRAVEL_PURPOSE_OPTIONS = [
  "観光",
  "合宿",
  "仕事",
  "ラフティング",
  "体育館",
  "その他",
] as const;

export const REFERRAL_OPTIONS = [
  "リピーター",
  "友人・知人",
  "ネット検索",
  "Googleマップ",
  "雑誌等",
  "その他",
] as const;

export const ARRIVAL_TIME_OPTIONS = [
  "16:00~17:00",
  "17:00~18:00",
  "18:00~19:00",
  "19:00~20:00",
  "20:00~21:00",
  "その他",
] as const;

export const MEAL_OPTIONS = [
  "未確認",
  "外食",
  "自炊（調理室ご利用）",
  "バーベキュー（バーベキュースペースご利用）",
] as const;

export const BBQ_OPTIONS = ["要", "不要", "持参する"] as const;

export const PAYMENT_STATUS_OPTIONS = ["未払い", "完了"] as const;

export const MANUAL_RESERVATION_STATUS_OPTIONS = ["仮予約", "確定"] as const;

/** STUDIO フォームと同じ人数内訳（1〜50）。合計「人数」欄はテキストのまま */
export const GUEST_COUNT_OPTIONS = Array.from({ length: 50 }, (_, i) =>
  String(i + 1)
) as readonly string[];

/** 一覧フィルタ用（GAS LIST_FILTER_FIELDS 相当） */
export const LIST_FILTER_CHANNEL_OPTIONS = CHANNEL_OPTIONS;

export const LIST_FILTER_MEAL_OPTIONS = MEAL_OPTIONS.filter((v) => v !== "未確認");

export const LIST_FILTER_BBQ_OPTIONS = BBQ_OPTIONS;

export const LIST_FILTER_PAYMENT_OPTIONS = PAYMENT_STATUS_OPTIONS;

/** DB 値がマスタ外のときも表示できるよう選択肢に足す */
export function optionsWithCurrent(
  options: readonly string[],
  current: string | null | undefined
): string[] {
  const v = String(current ?? "").trim();
  if (!v) return [...options];
  if (options.includes(v)) return [...options];
  return [v, ...options];
}

/** 複数選択（読点・カンマ区切り）の保存値を配列に分解 */
export function parseMultiSelectValues(
  raw: string | null | undefined
): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const parts = text
    .split(/[、,／/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(parts)];
}

/** 複数選択値を DB 保存用に結合（読点区切り） */
export function joinMultiSelectValues(values: readonly string[]): string {
  const cleaned = [
    ...new Set(values.map((v) => String(v).trim()).filter(Boolean)),
  ];
  return cleaned.join("、");
}

/** 複数選択の現行値をマスタに足す */
export function optionsWithCurrentValues(
  options: readonly string[],
  current: string | null | undefined
): string[] {
  const selected = parseMultiSelectValues(current);
  const extra = selected.filter((v) => !options.includes(v));
  return extra.length ? [...extra, ...options] : [...options];
}
