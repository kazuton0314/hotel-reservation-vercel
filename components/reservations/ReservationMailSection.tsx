"use client";

import { useActionState, useState } from "react";
import { setMailKindSentAction } from "@/lib/actions/reservations";
import { MailComposeModal } from "@/components/mail/MailComposeModal";
import { MailKindBadge } from "@/components/mail/MailKindBadgeGroup";
import { Button } from "@/components/ui/button";
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

export function ReservationMailSection(props: Props) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeKind, setComposeKind] = useState<string>("");
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

  const kinds: { kind: MailKind }[] = [
    { kind: "予約確定" },
    { kind: "11日前" },
    { kind: "3日前" },
  ];

  function openCompose(kind: string) {
    if (!hasEmail) return;
    setComposeKind(kind);
    setComposeOpen(true);
  }

  function submitFlag(kind: MailKind, sent: boolean) {
    const fd = new FormData();
    fd.set("reservation_id", props.reservationId);
    fd.set("mail_kind", kind);
    fd.set("sent", sent ? "true" : "false");
    formAction(fd);
  }

  if (props.status === "仮予約") {
    const sentAtStr = formatSentAt(props.completionEmailSentAt);
    return (
      <div className="detail-block" id="mail-action-block">
        <h3>確認</h3>
        {!hasEmail ? (
          <p className="detail-hint">メール未登録（電話等で確認した場合は「確認済」にしてください）</p>
        ) : null}
        <div className="mail-action-card">
          <div className="mail-action-card-head">
            <span className="mail-action-card-title">仮予約連絡</span>
            <span className={`mail-pill ${props.completionEmailSent ? "mail-pill-sent" : "mail-pill-pending"}`}>
              {props.completionEmailSent ? "確認済" : "未確認"}
            </span>
          </div>
          {sentAtStr ? <p className="form-hint">{sentAtStr}</p> : null}
          <div className="mail-action-card-actions">
            {hasEmail ? (
              <Button
                type="button"
                size="sm"
                className="mail-action-primary"
                onClick={() => openCompose("仮予約")}
              >
                メールを作成
              </Button>
            ) : null}
            <div className="mail-action-secondary-row">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending || props.completionEmailSent}
                onClick={() => submitFlag("予約確定", true)}
              >
                確認済
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending || !props.completionEmailSent}
                onClick={() => submitFlag("予約確定", false)}
              >
                未確認に戻す
              </Button>
            </div>
          </div>
        </div>
        {hasEmail ? (
          <MailComposeModal
            open={composeOpen}
            onClose={() => setComposeOpen(false)}
            to={props.email ?? ""}
            title="仮予約メール"
            templates={props.mailTemplates}
            entityType="reservation"
            entityId={props.reservationId}
            mailKind="仮予約"
            placeholderContext={props.placeholderContext}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="detail-block" id="reservation-mails-block">
      <h3>確認</h3>
      {!hasEmail ? (
        <p className="detail-hint">メール未登録（電話等で確認した場合は「確認済」にしてください）</p>
      ) : null}
      <div className="mail-kind-stack">
        {kinds.map((item) => {
          const st = buildReservationMailKindStatus(mailRow, item.kind);
          const sentAt = formatSentAt(
            item.kind === "予約確定"
              ? props.completionEmailSentAt
              : item.kind === "11日前"
                ? props.day11EmailSentAt
                : props.day3EmailSentAt
          );
          return (
            <article key={item.kind} className="mail-action-card" data-mail-kind={item.kind}>
              <div className="mail-action-card-head">
                <span className="mail-action-card-title">{item.kind}</span>
                <MailKindBadge
                  status={st}
                  hasEmail={Boolean(props.email)}
                  reservationStatus={props.status}
                />
              </div>
              {sentAt ? <p className="form-hint">{sentAt}</p> : null}
              {st.reason && st.notRequired ? (
                <p className="form-hint">{st.reason}</p>
              ) : null}
              <div className="mail-action-card-actions">
                {hasEmail ? (
                  <Button
                    type="button"
                    size="sm"
                    className="mail-action-primary"
                    disabled={st.notRequired && !st.sent}
                    onClick={() => openCompose(item.kind)}
                  >
                    メールを作成
                  </Button>
                ) : null}
                <div className="mail-action-secondary-row">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending || st.sent}
                    onClick={() => submitFlag(item.kind, true)}
                  >
                    確認済
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending || !st.sent}
                    onClick={() => submitFlag(item.kind, false)}
                  >
                    未確認に戻す
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {state.ok === false ? (
        <p className="detail-hint" style={{ color: "#b91c1c" }}>
          {state.message}
        </p>
      ) : null}
      {hasEmail ? (
        <MailComposeModal
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          to={props.email ?? ""}
          title={composeKind ? `${composeKind}メール` : "メール作成"}
          templates={props.mailTemplates}
          entityType="reservation"
          entityId={props.reservationId}
          mailKind={composeKind}
          placeholderContext={props.placeholderContext}
        />
      ) : null}
    </div>
  );
}
