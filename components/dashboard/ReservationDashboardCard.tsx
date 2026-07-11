import Link from "next/link";
import type { DashboardListItem } from "@/lib/queries/dashboard";
import {
  ReservationStatusBadge,
} from "@/components/list/ReservationListBadges";
import { formatDisplayName } from "@/lib/utils/display-name";
import { formatGuestCompact } from "@/lib/utils/guest-display";
import { reservationMailStatusesFromItem } from "@/lib/utils/reservation-mail-badges";

export function ReservationDashboardCard({
  item,
  nightNumber,
}: {
  item: DashboardListItem;
  nightNumber?: number;
}) {
  const compact = formatGuestCompact({
    guest_total: item.guestTotal,
    adult_male: item.adultMale,
    adult_female: item.adultFemale,
    boy_student: item.boyStudent,
    girl_student: item.girlStudent,
    age_3plus: item.age3plus,
    under_3: item.under3,
  });
  const mailStatuses =
    item.status === "確定" && item.email
      ? reservationMailStatusesFromItem({
          status: item.status,
          email: item.email,
          check_in: item.checkIn,
          check_out: item.checkOut,
          completion_email_sent: item.completionEmailSent,
          day11_email_sent: item.day11EmailSent,
          day3_email_sent: item.day3EmailSent,
          companion_form_answered: item.companionFormAnswered,
          guest_total: item.guestTotal,
          adult_male: item.adultMale,
          adult_female: item.adultFemale,
          boy_student: item.boyStudent,
          girl_student: item.girlStudent,
          age_3plus: item.age3plus,
          under_3: item.under3,
        })
      : null;
  const mailKinds = mailStatuses
    ? [
        { label: "予約確定", st: mailStatuses.confirmation },
        { label: "11日前", st: mailStatuses.day11 },
        { label: "3日前", st: mailStatuses.day3 },
      ]
    : [];
  const displayName = formatDisplayName(item.representativeName);

  return (
    <Link
      href={`/reservations/${encodeURIComponent(item.reservationId)}`}
      className="card list-card block"
    >
      <div className="row-card-head">
        <p className="card-title list-card-title">{displayName}</p>
        <div className="row-card-badges">
          <ReservationStatusBadge status={item.status} />
        </div>
      </div>
      <p className="card-sub">
        {item.reservationId} / {item.checkIn}〜{item.checkOut}
        {nightNumber ? ` / ${nightNumber}泊目` : ""}
      </p>
      {item.status === "確定" ? (
        <div className="status-groups compact">
          {item.companionGuestRequired ? (
            <span className={`status-pill${item.companionPending ? " warn" : ""}`}>同行者</span>
          ) : null}
          <span className={`status-pill${item.assignmentStatus === "未割当" ? " warn" : ""}`}>部屋割</span>
          {mailKinds.map(({ label, st }) => {
            const cls = st.pending && !st.notRequired ? "status-pill warn" : "status-pill";
            const suffix =
              label === "予約確定" ? "" : st.notRequired ? " -" : st.sent ? " 済" : " 未";
            return (
              <span key={label} className={cls} title={st.sentAtStr || undefined}>
                {label}
                {suffix}
              </span>
            );
          })}
        </div>
      ) : null}
      {compact && compact !== "—" ? (
        <p className="card-meta">
          <span className="meta-guests">{compact}</span>
        </p>
      ) : null}
      {item.assignedRooms ? (
        <p className="card-row">
          <strong>部屋:</strong> {item.assignedRooms}
        </p>
      ) : null}
      {item.inquiry ? (
        <p className="card-row">
          <strong>問合せ:</strong> {item.inquiry}
        </p>
      ) : null}
    </Link>
  );
}

export function DashboardSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="section-title">{title}</div>
      {children}
    </section>
  );
}

export function DashboardEmpty() {
  return <div className="empty">なし</div>;
}
