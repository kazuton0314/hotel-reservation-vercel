import type { MailKindStatus } from "@/lib/utils/mail-kind-status";
import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";

/**
 * タスクチップの表示思想（一覧・ホーム・詳細で共通）
 *
 * ラベルは固定（例: 同行者 / 部屋割 / 予約確定 / 11日前 / 3日前）。
 * 状態は色だけで伝える。未・済・— などの接尾辞は付けない。
 * 理由の区別は title（ホバー）に集約する。
 *
 * | 色 | 意味 |
 * |----|------|
 * | 緑 done | 完了（連絡済・割当済・同行者入力済） |
 * | 橙 action | 今すぐ対応が必要 |
 * | 灰 wait | 対象だが連絡時期前（11日前/3日前のウィンドウ前） |
 * | 灰薄 skip | 業務上不要（リード不足・同行者不要・非確定など） |
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

export function mailKindChipState(
  st: MailKindStatus,
  reservationStatus: string
): { state: TaskChipState; title: string } {
  const label = st.label;

  if (st.sent) {
    return {
      state: "done",
      title: st.sentAtStr
        ? `${label}${CONTACT_LABELS.done}（${st.sentAtStr}）`
        : `${label}${CONTACT_LABELS.done}`,
    };
  }

  if (st.notRequired) {
    const reason =
      st.reason ||
      (st.kind === "11日前"
        ? "チェックインまで11日未満のため不要"
        : st.kind === "3日前"
          ? "送信条件を満たさないため不要"
          : `${label}は不要です`);
    return { state: "skip", title: reason };
  }

  if (st.pending) {
    return {
      state: "action",
      title: `${label}の連絡が未了です（電話・メール等）`,
    };
  }

  if (st.applicable) {
    return { state: "wait", title: `${label}の連絡時期前です` };
  }

  if (reservationStatus !== "確定") {
    return { state: "skip", title: "確定予約のみ対象です" };
  }

  return { state: "skip", title: st.reason || `${label}は対象外です` };
}

const REQUEST_CONFIRM_STATUSES = new Set(["承認済", "却下", "本予約連携済"]);

/** リクエスト一覧の確認チップ（本予約のメール種別チップと同じ位置づけ） */
export function requestConfirmChipState(
  status: string,
  confirmed: boolean
): { state: TaskChipState; title: string } | null {
  if (!REQUEST_CONFIRM_STATUSES.has(status)) return null;

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
