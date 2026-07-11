"use client";

import { useActionState, useState } from "react";
import { updateRequestReplyMailAction } from "@/lib/actions/requests";
import { MailComposeModal } from "@/components/mail/MailComposeModal";
import { Button } from "@/components/ui/button";
import type { MailEntityContext } from "@/lib/services/mail-placeholders";

type Props = {
  requestId: string;
  email: string | null;
  status: string;
  replyEmailSent: boolean;
  replyEmailSentAt: string | null;
  placeholderContext: MailEntityContext;
};

const initialState = { ok: true } as const;

function formatSentAt(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("ja-JP");
}

export function RequestMailBlock({
  requestId,
  email,
  status,
  replyEmailSent,
  replyEmailSentAt,
  placeholderContext,
}: Props) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateRequestReplyMailAction,
    initialState
  );

  if (
    status !== "リクエスト" &&
    status !== "承認済" &&
    status !== "却下" &&
    status !== "本予約連携済"
  ) {
    return null;
  }

  const hasEmail = Boolean(email?.trim());
  const sentAtStr = formatSentAt(replyEmailSentAt);

  return (
    <div className="detail-block" id="mail-action-block">
      <h3>確認</h3>
      {!hasEmail ? (
        <p className="detail-hint">メール未登録（電話等で確認した場合は「確認済」にしてください）</p>
      ) : null}
      <div className="mail-action-card">
        <div className="mail-action-card-head">
          <span className="mail-action-card-title">リクエスト確認</span>
          <span className={`mail-pill ${replyEmailSent ? "mail-pill-sent" : "mail-pill-pending"}`}>
            {replyEmailSent ? "確認済" : "未確認"}
          </span>
        </div>
        {sentAtStr ? <p className="form-hint">{sentAtStr}</p> : null}
        <div className="mail-action-card-actions">
          {hasEmail ? (
            <Button
              type="button"
              size="sm"
              className="mail-action-primary"
              onClick={() => setComposeOpen(true)}
            >
              メールを作成
            </Button>
          ) : null}
          <div className="mail-action-secondary-row">
            <form action={formAction} className="mail-action-form">
              <input type="hidden" name="request_id" value={requestId} />
              <input
                type="hidden"
                name="reply_email_sent"
                value={replyEmailSent ? "false" : "true"}
              />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={pending || replyEmailSent}
              >
                確認済
              </Button>
            </form>
            <form action={formAction} className="mail-action-form">
              <input type="hidden" name="request_id" value={requestId} />
              <input type="hidden" name="reply_email_sent" value="false" />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={pending || !replyEmailSent}
              >
                未確認に戻す
              </Button>
            </form>
          </div>
        </div>
      </div>

      {hasEmail ? (
        <MailComposeModal
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          to={email ?? ""}
          title="リクエスト返信メール"
          entityType="request"
          entityId={requestId}
          placeholderContext={placeholderContext}
        />
      ) : null}

      {state.ok === false ? (
        <p className="detail-hint" style={{ color: "#b91c1c" }}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
