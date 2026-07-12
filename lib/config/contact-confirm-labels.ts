/** 予約・リクエストの連絡（メール／電話等）の表示ラベル */

export const CONTACT_LABELS = {
  /** 状態（チップ・ボタン・絞り込み値） */
  pending: "未連絡",
  done: "連絡済",
  revertTitle: "未連絡に戻す",
  /** 絞り込み項目名 */
  filterFieldLabel: "連絡",
  filterPending: "未連絡",
  filterDone: "連絡済",
  /** ホーム残タスク */
  todoLabel: "連絡未",
  todoHint: "予約確定・11日前・3日前の連絡が未了",
  /** 予約詳細ブロック見出し */
  sectionTitle: "連絡",
  /** 一覧バッジ（短） */
  badgePending: "連絡未",
  /** リクエスト */
  requestSectionTitle: "リクエスト確定",
  requestRowLabel: "リクエスト確定",
  requestDoneTitle: "リクエスト連絡済",
  requestPendingTitle: "リクエスト未連絡（電話・メール等）",
} as const;

/** @deprecated CONTACT_LABELS を使用 */
export const CONTACT_CONFIRM = CONTACT_LABELS;
