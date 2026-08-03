"use client";

import { useActionState, useState } from "react";
import { updateRequestReplyMailAction } from "@/lib/actions/requests";
import { MailComposeModal } from "@/components/mail/MailComposeModal";
import { Button } from "@/components/ui/button";
import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";
import { normalizeRequestStatus } from "@/lib/domain/request-status";
import type { MailEntityContext } from "@/lib/services/mail-placeholders";
import { formatDateTimeJa } from "@/lib/utils/date-label";

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
  return formatDateTimeJa(value);
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

  if (!normalizeRequestStatus(status)) {
    return null;
  }

  const hasEmail = Boolean(email?.trim());
  const sentAtStr = formatSentAt(replyEmailSentAt);

  return (
    <div className="detail-block confirm-section" id="mail-action-block">
      <div className="confirm-section-head">
        <h3>{CONTACT_LABELS.requestSectionTitle}</h3>
        {hasEmail ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setComposeOpen(true)}
          >
            メール作成
          </Button>
        ) : null}
      </div>

      <div className="confirm-rows">
        <div className="confirm-row">
          <span className="confirm-row-label">{CONTACT_LABELS.requestRowLabel}</span>
          <span
            className={`mail-pill ${replyEmailSent ? "mail-pill-sent" : "mail-pill-pending"}`}
            title={sentAtStr || undefined}
          >
            {replyEmailSent ? CONTACT_LABELS.done : CONTACT_LABELS.pending}
          </span>
          <div className="confirm-row-actions">
            <form action={formAction} className="confirm-row-form">
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
                {CONTACT_LABELS.done}
              </Button>
            </form>
            <form action={formAction} className="confirm-row-form">
              <input type="hidden" name="request_id" value={requestId} />
              <input type="hidden" name="reply_email_sent" value="false" />
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={pending || !replyEmailSent}
                title={CONTACT_LABELS.revertTitle}
              >
                戻す
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
        <p className="detail-hint confirm-section-error">{state.message}</p>
      ) : null}
    </div>
  );
}
