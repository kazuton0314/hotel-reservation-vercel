import Link from "next/link";
import type { DashboardListItem } from "@/lib/queries/dashboard";
import { ListCardStayDetails } from "@/components/list/ListCardStayDetails";
import { ReservationStatusBadge } from "@/components/list/ReservationListBadges";
import { ReservationTaskChips } from "@/components/reservations/ReservationTaskChips";
import { formatDisplayName } from "@/lib/utils/display-name";
import { formatGuestCompact } from "@/lib/utils/guest-display";

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
  const displayName = formatDisplayName(item.representativeName);

  return (
    <Link
      href={`/reservations/${encodeURIComponent(item.reservationId)}?from=home`}
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
      <ReservationTaskChips
        item={{
          status: item.status,
          email: item.email,
          check_in: item.checkIn,
          check_out: item.checkOut,
          created_at: item.createdAt,
          sheet_created_at: item.sheetCreatedAt,
          assignment_status: item.assignmentStatus,
          companion_required: item.companionGuestRequired,
          companion_pending: item.companionPending,
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
        }}
      />
      <ListCardStayDetails
        guests={compact}
        rooms={item.assignedRooms}
        arrivalTime={item.arrivalTime}
        meal={item.meal}
        bbq={item.bbq}
        vehicleCount={item.vehicleCount}
        inquiry={item.inquiry}
        internalMemo={item.internalMemo}
        guestMemo={item.guestMemo}
      />
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
