"use client";

import { startTransition, useActionState, useState } from "react";
import { setMailKindSentAction } from "@/lib/actions/reservations";
import { MailComposeModal } from "@/components/mail/MailComposeModal";
import { Button } from "@/components/ui/button";
import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";
import type { MailTemplate } from "@/lib/config/mail-templates";
import type { MailEntityContext } from "@/lib/services/mail-placeholders";
import { buildReservationMailKindStatus } from "@/lib/utils/mail-kind-status";

type MailKind = "予約確定" | "11日前" | "3日前";

type Props = {
  reservationId: string;
  email: string | null;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  createdAt?: string | null;
  sheetCreatedAt?: string | null;
  guestTotal: string | null;
  adultMale: string | null;
  adultFemale: string | null;
  boyStudent: string | null;
  girlStudent: string | null;
  age3plus: string | null;
  under3: string | null;
  companionFormAnswered: boolean;
  completionEmailSent: boolean;
  day11EmailSent: boolean;
  day3EmailSent: boolean;
  completionEmailSentAt: string | null;
  day11EmailSentAt: string | null;
  day3EmailSentAt: string | null;
  mailTemplates?: MailTemplate[];
  placeholderContext: MailEntityContext;
};

const initialState = { ok: true } as const;

function formatSentAt(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("ja-JP");
}

function ConfirmRow({
  label,
  sent,
  sentAt,
  notRequired,
  hint,
  pending,
  onConfirm,
  onUnconfirm,
}: {
  label: string;
  sent: boolean;
  sentAt: string | null;
  notRequired: boolean;
  hint?: string;
  pending: boolean;
  onConfirm: () => void;
  onUnconfirm: () => void;
}) {
  // 不要でも連絡済にでき、戻すと再び不要表示
  const pillClass =
    sent
      ? "mail-pill-sent"
      : notRequired
        ? "mail-pill-skip"
        : "mail-pill-pending";
  const pillLabel = sent
    ? CONTACT_LABELS.done
    : notRequired
      ? "不要"
      : CONTACT_LABELS.pending;
  const title = sentAt || hint || undefined;

  return (
    <div className="confirm-row">
      <span className="confirm-row-label">{label}</span>
      <span className={`mail-pill ${pillClass}`} title={title}>
        {pillLabel}
      </span>
      <div className="confirm-row-actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending || sent}
          onClick={onConfirm}
        >
          {CONTACT_LABELS.done}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending || !sent}
          title={CONTACT_LABELS.revertTitle}
          onClick={onUnconfirm}
        >
          戻す
        </Button>
      </div>
    </div>
  );
}

export function ReservationMailSection(props: Props) {
  const isConfirmed = props.status === "確定";
  const [composeOpen, setComposeOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    setMailKindSentAction,
    initialState
  );

  const hasEmail = Boolean(props.email?.trim());

  const mailRow = {
    status: props.status,
    email: props.email,
    check_in: props.checkIn,
    check_out: props.checkOut,
    created_at: props.createdAt,
    sheet_created_at: props.sheetCreatedAt,
    completion_email_sent: props.completionEmailSent,
    day11_email_sent: props.day11EmailSent,
    day3_email_sent: props.day3EmailSent,
    completion_email_sent_at: props.completionEmailSentAt,
    day11_email_sent_at: props.day11EmailSentAt,
    day3_email_sent_at: props.day3EmailSentAt,
    companion_form_answered: props.companionFormAnswered,
    guest_total: props.guestTotal,
    adult_male: props.adultMale,
    adult_female: props.adultFemale,
    boy_student: props.boyStudent,
    girl_student: props.girlStudent,
    age_3plus: props.age3plus,
    under_3: props.under3,
  };

  function submitFlag(kind: MailKind, sent: boolean) {
    const fd = new FormData();
    fd.set("reservation_id", props.reservationId);
    fd.set("mail_kind", kind);
    fd.set("sent", sent ? "true" : "false");
    startTransition(() => {
      formAction(fd);
    });
  }

  // 仮予約には連絡タスクなし（メール作成のみ可）
  const rows = isConfirmed
    ? (
        [
          {
            key: "confirmation",
            label: "予約確定",
            kind: "予約確定" as MailKind,
            sent: props.completionEmailSent,
            sentAt: props.completionEmailSentAt,
          },
          {
            key: "day11",
            label: "11日前",
            kind: "11日前" as MailKind,
            sent: props.day11EmailSent,
            sentAt: props.day11EmailSentAt,
          },
          {
            key: "day3",
            label: "3日前",
            kind: "3日前" as MailKind,
            sent: props.day3EmailSent,
            sentAt: props.day3EmailSentAt,
          },
        ] as const
      ).map((row) => {
        const st = buildReservationMailKindStatus(mailRow, row.kind);
        return {
          ...row,
          notRequired: st.notRequired,
          hint: st.reason || undefined,
        };
      })
    : [];

  return (
    <div
      className="detail-block confirm-section"
      id="reservation-mails-block"
    >
      <div className="confirm-section-head">
        <h3>{CONTACT_LABELS.sectionTitle}</h3>
        {hasEmail ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setComposeOpen(true)}
          >
            メール作成
          </Button>
        ) : (
          <span className="form-hint">メールアドレス未登録</span>
        )}
      </div>

      {isConfirmed ? (
        <div className="confirm-rows">
          {rows.map((row) => (
            <ConfirmRow
              key={row.key}
              label={row.label}
              sent={row.sent}
              sentAt={formatSentAt(row.sentAt)}
              notRequired={row.notRequired}
              hint={row.hint}
              pending={pending}
              onConfirm={() => submitFlag(row.kind, true)}
              onUnconfirm={() => submitFlag(row.kind, false)}
            />
          ))}
        </div>
      ) : (
        <p className="detail-hint">
          連絡タスク（予約確定・11日前・3日前）は確定予約のみです。
        </p>
      )}

      {state.ok === false ? (
        <p className="detail-hint confirm-section-error">{state.message}</p>
      ) : null}

      {hasEmail ? (
        <MailComposeModal
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          to={props.email ?? ""}
          title="メール作成"
          templates={props.mailTemplates}
          entityType="reservation"
          entityId={props.reservationId}
          placeholderContext={props.placeholderContext}
        />
      ) : null}
    </div>
  );
}
