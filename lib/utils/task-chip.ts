import type { MailKindStatus } from "@/lib/utils/mail-kind-status";

/**
 * タスクチップの表示思想（一覧・ホーム・詳細で共通）
 *
 * ラベルは固定（例: 同行者 / 部屋割 / 予約確定 / 11日前 / 3日前）。
 * 状態は色だけで伝える。未・済・— などの接尾辞は付けない。
 * 理由の区別は title（ホバー）に集約する。
 *
 * | 色 | 意味 |
 * |----|------|
 * | 緑 done | 完了（送信済・割当済・同行者入力済） |
 * | 橙 action | 今すぐ対応が必要 |
 * | 灰 wait | 対象だが送信時期前（11日前/3日前のウィンドウ前） |
 * | 灰薄 skip | 業務上不要（リード不足・同行者不要・非確定など） |
 * | 灰点線 blocked | メールなしで送れない |
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
  hasEmail: boolean,
  reservationStatus: string
): { state: TaskChipState; title: string } {
  const label = st.label;

  if (st.sent) {
    return {
      state: "done",
      title: st.sentAtStr ? `${label}メール送信済（${st.sentAtStr}）` : `${label}メール送信済`,
    };
  }

  if (!hasEmail) {
    if (reservationStatus === "確定" && (st.applicable || st.kind === "予約確定")) {
      return { state: "blocked", title: "メールアドレス未登録のため送信できません" };
    }
    if (st.notRequired) {
      return { state: "skip", title: st.reason || `${label}メールは不要です` };
    }
    return { state: "skip", title: "メールアドレス未登録" };
  }

  if (st.notRequired) {
    const reason =
      st.reason ||
      (st.kind === "11日前"
        ? "チェックインまで11日未満の予約のため11日前メールは不要"
        : st.kind === "3日前"
          ? "送信条件を満たさないため3日前メールは不要"
          : `${label}メールは不要です`);
    return { state: "skip", title: reason };
  }

  if (st.pending) {
    return { state: "action", title: `${label}メールが未送信です` };
  }

  if (st.applicable) {
    return { state: "wait", title: `${label}メールの送信時期前です` };
  }

  return { state: "skip", title: st.reason || `${label}メールは対象外です` };
}

const REQUEST_REPLY_STATUSES = new Set(["承認済", "却下", "本予約連携済"]);

/** リクエスト一覧の返信メールチップ（本予約のメール種別チップと同じ位置づけ） */
export function requestReplyChipState(
  status: string,
  hasEmail: boolean,
  replyEmailSent: boolean
): { state: TaskChipState; title: string } | null {
  if (!REQUEST_REPLY_STATUSES.has(status)) return null;

  if (replyEmailSent) {
    return { state: "done", title: "返信メール送信済" };
  }
  if (!hasEmail) {
    return {
      state: "blocked",
      title: "メールアドレス未登録のため送信できません",
    };
  }
  return { state: "action", title: "返信メールが未送信です" };
}
