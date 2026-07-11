import Link from "next/link";
import type { ReservationListItem } from "@/lib/queries/reservations";
import { ReservationListStatusActions } from "@/components/reservations/ReservationListStatusActions";
import { formatReceivedDate } from "@/lib/services/reservation-list-filter";
import { formatDisplayName } from "@/lib/utils/display-name";
import { formatGuestCompact } from "@/lib/utils/guest-display";
import { reservationMailStatusesFromListItem } from "@/lib/utils/reservation-mail-badges";
import type { MailKindStatus } from "@/lib/utils/mail-kind-status";

function mailPillClass(st: MailKindStatus, noEmail: boolean): string {
  if (noEmail) return "status-pill status-pill-muted";
  if (st.sent) return "status-pill status-pill-ok";
  if (st.notRequired) return "status-pill status-pill-muted";
  if (st.pending) return "status-pill warn";
  return "status-pill";
}

function MailKindPill({
  label,
  st,
  noEmail,
}: {
  label: string;
  st: MailKindStatus;
  noEmail: boolean;
}) {
  const title = noEmail
    ? "メールアドレス未登録"
    : st.sentAtStr || st.reason || undefined;
  return (
    <span className={mailPillClass(st, noEmail)} title={title}>
      {label}
      {noEmail ? " —" : st.sent ? " 済" : st.pending ? " 未" : ""}
    </span>
  );
}

export function ReservationListRow({ item }: { item: ReservationListItem }) {
  const compact = formatGuestCompact({
    guest_total: item.guest_total,
    adult_male: item.adult_male,
    adult_female: item.adult_female,
    boy_student: item.boy_student,
    girl_student: item.girl_student,
    age_3plus: item.age_3plus,
    under_3: item.under_3,
  });
  const received = formatReceivedDate(item.received_ms);
  const noEmail = !item.email?.trim();
  const mailStatuses =
    item.status === "確定" ? reservationMailStatusesFromListItem(item) : null;
  const displayName = formatDisplayName(item.representative_name);
  const mailKinds = mailStatuses
    ? [
        { label: "予約確定", st: mailStatuses.confirmation },
        { label: "11日前", st: mailStatuses.day11 },
        { label: "3日前", st: mailStatuses.day3 },
      ]
    : [];

  return (
    <Link
      href={`/reservations/${encodeURIComponent(item.reservation_id)}`}
      prefetch
      className="card list-card reservation-row-card block"
    >
      <div className="row-card-head">
        <p className="card-title list-card-title">{displayName}</p>
        <div className="row-card-badges">
          <ReservationListStatusActions
            reservationId={item.reservation_id}
            status={item.status}
            updatedAt={item.updated_at}
          />
        </div>
      </div>
      <p className="card-sub">
        {item.reservation_id} / {item.check_in}〜{item.check_out}
        {received ? ` / 受付 ${received}` : ""}
      </p>
      {item.status === "確定" ? (
        <div className="status-groups compact">
          {item.companion_required ? (
            <span
              className={`status-pill${item.companion_pending ? " warn" : " status-pill-ok"}`}
              title={item.companion_pending ? "同行者情報未入力" : "同行者情報入力済"}
            >
              同行者{item.companion_pending ? " 未" : " 済"}
            </span>
          ) : null}
          <span className={`status-pill${item.assignment_status === "未割当" ? " warn" : ""}`}>
            部屋割{item.assignment_status === "未割当" ? " 未" : ""}
          </span>
          {mailKinds.map(({ label, st }) => (
            <MailKindPill key={label} label={label} st={st} noEmail={noEmail} />
          ))}
        </div>
      ) : null}
      {compact && compact !== "—" ? (
        <p className="card-meta">
          <span className="meta-guests">{compact}</span>
        </p>
      ) : null}
      {item.assigned_rooms ? (
        <p className="card-row">
          <strong>部屋:</strong> {item.assigned_rooms}
        </p>
      ) : null}
    </Link>
  );
}
