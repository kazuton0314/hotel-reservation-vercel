/** 一覧フィルタ: 空欄・null 用（各カテゴリの分割を閉じる） */
export const UNSET_FILTER_VALUE = "__unset__";

/** 部屋割: 割当済（未割当の補集合。個別部屋は内訳用で重複しうる） */
export const ASSIGNED_ROOM_FILTER = "__assigned__";

export function isUnsetFilterValue(value?: string | null): boolean {
  return value === UNSET_FILTER_VALUE;
}

export function isBlankFilterFieldValue(raw: unknown): boolean {
  return raw == null || String(raw).trim() === "";
}

export function withUnsetOption(
  options: { value: string; label: string }[],
  unsetLabel = "未設定"
): { value: string; label: string }[] {
  return [...options, { value: UNSET_FILTER_VALUE, label: unsetLabel }];
}
