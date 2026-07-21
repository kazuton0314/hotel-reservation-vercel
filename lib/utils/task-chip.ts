import type { MailKindStatus } from "@/lib/utils/mail-kind-status";
import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";
import {
  isApprovedRequestStatus,
  isRejectedRequestStatus,
} from "@/lib/domain/request-status";

/**
 * タスクチップの表示思想（一覧・ホームで共通）
 *
 * 連絡系（リクエスト確定連絡・予約確定・11日前・3日前）は色3種のみ:
 * | 色 | 意味 |
 * |----|------|
 * | 緑 done | 連絡済・割当済・同行者入力済 |
 * | 橙 action | 今すぐ対応が必要 |
 * | 灰 wait | 対象だが連絡時期前（主に11日前） |
 *
 * 不要な連絡ラベルはチップ自体を出さない（薄いグレー skip は使わない）。
 */
export type TaskChipState = "done" | "action" | "wait" | "skip" | "blocked";

export function taskChipClassName(state: TaskChipState): string {
  return `task-chip task-chip-${state}`;
}

export function companionChipState(
  pending: boolean
): { state: TaskChipState; title: string } {
  if (pending) {
    return { state: "action", title: "同行者情報が未入力です" };
  }
  return { state: "done", title: "同行者情報入力済み" };
}

export function assignmentChipState(
  assignmentStatus: string | null
): { state: TaskChipState; title: string } {
  if (assignmentStatus === "未割当") {
    return { state: "action", title: "部屋が未割当です" };
  }
  return { state: "done", title: "部屋割当済み" };
}

/** null = 一覧に出さない（不要・時期前の3日前など） */
export function mailKindChipState(
  st: MailKindStatus,
  _reservationStatus?: string
): { state: TaskChipState; title: string } | null {
  if (!st.showOnList) return null;

  const label = st.label;

  if (st.sent) {
    return {
      state: "done",
      title: st.sentAtStr
        ? `${label}${CONTACT_LABELS.done}（${st.sentAtStr}）`
        : `${label}${CONTACT_LABELS.done}`,
    };
  }

  if (st.pending) {
    return {
      state: "action",
      title: `${label}の連絡が未了です（電話・メール等）`,
    };
  }

  if (st.applicable && !st.notRequired) {
    return { state: "wait", title: `${label}の連絡時期前です` };
  }

  return null;
}

function isRequestWorkflowSettled(status: string): boolean {
  return isApprovedRequestStatus(status) || isRejectedRequestStatus(status);
}

/** リクエスト一覧の確認チップ（緑／橙のみ） */
export function requestConfirmChipState(
  status: string,
  confirmed: boolean
): { state: TaskChipState; title: string } | null {
  if (!isRequestWorkflowSettled(status)) return null;

  if (confirmed) {
    return { state: "done", title: CONTACT_LABELS.requestDoneTitle };
  }
  return {
    state: "action",
    title: CONTACT_LABELS.requestPendingTitle,
  };
}

/** @deprecated requestConfirmChipState を使用 */
export function requestReplyChipState(
  status: string,
  _hasEmail: boolean,
  replyEmailSent: boolean
): { state: TaskChipState; title: string } | null {
  return requestConfirmChipState(status, replyEmailSent);
}
