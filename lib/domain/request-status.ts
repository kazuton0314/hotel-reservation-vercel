/**
 * リクエストの業務ステータス（唯一の許可値）。
 * 連携有無は status ではなく linked_reservation_id で表す。
 */
export const REQUEST_WORKFLOW_STATUSES = [
  "リクエスト",
  "承認済",
  "却下",
] as const;

export type RequestWorkflowStatus = (typeof REQUEST_WORKFLOW_STATUSES)[number];

/** @deprecated 互換エイリアス — REQUEST_WORKFLOW_STATUSES を使う */
export const REQUEST_STATUS_OPTIONS = REQUEST_WORKFLOW_STATUSES;

const LEGACY_LINKED_STATUS = "本予約連携済";

/** レガシー値を業務ステータスへ正規化。未知は null */
export function normalizeRequestStatus(
  status: string | null | undefined
): RequestWorkflowStatus | null {
  const s = String(status ?? "").trim();
  if (s === LEGACY_LINKED_STATUS) return "承認済";
  if ((REQUEST_WORKFLOW_STATUSES as readonly string[]).includes(s)) {
    return s as RequestWorkflowStatus;
  }
  return null;
}

export function isApprovedRequestStatus(
  status: string | null | undefined
): boolean {
  return normalizeRequestStatus(status) === "承認済";
}

export function isRejectedRequestStatus(
  status: string | null | undefined
): boolean {
  return normalizeRequestStatus(status) === "却下";
}

/** 表示・レール用（レガシーも承認済に見せる） */
export function displayRequestStatus(
  status: string | null | undefined
): string {
  return normalizeRequestStatus(status) ?? String(status ?? "").trim();
}

/**
 * 未リンク照合の対象か。
 * ステータスがリクエスト/承認済で、linked が無いもの。
 */
export function isRequestNeedingLink(
  status: string | null | undefined,
  linkedReservationId: string | null | undefined
): boolean {
  if (linkedReservationId) return false;
  const n = normalizeRequestStatus(status);
  return n === "リクエスト" || n === "承認済";
}

/** 自動リンク対象（旧 isRequestOpenForLink） */
export function isRequestOpenForLink(status: string | null | undefined): boolean {
  const n = normalizeRequestStatus(status);
  return n === "リクエスト" || n === "承認済";
}
