import Link from "next/link";
import type { DashboardListItem } from "@/lib/queries/dashboard";
import type { CalendarDayCard } from "@/lib/services/calendar";
import { ListCardStayDetails } from "@/components/list/ListCardStayDetails";
import { ReservationListStatusActions } from "@/components/reservations/ReservationListStatusActions";
import { ReservationTaskChips } from "@/components/reservations/ReservationTaskChips";
import { formatDisplayName } from "@/lib/utils/display-name";
import { formatGuestCompact } from "@/lib/utils/guest-display";

export type ReservationCardItem = DashboardListItem;

export function calendarDayCardToListItem(card: CalendarDayCard): DashboardListItem {
  return {
    reservationId: card.reservationId,
    representativeName: card.representativeName,
    status: card.status,
    checkIn: card.checkIn,
    checkOut: card.checkOut,
    guestTotal: card.guestTotal,
    adultMale: card.adultMale,
    adultFemale: card.adultFemale,
    boyStudent: card.boyStudent,
    girlStudent: card.girlStudent,
    age3plus: card.age3plus,
    under3: card.under3,
    meal: card.meal,
    bbq: card.bbq,
    somen: card.somen,
    inquiry: card.inquiry,
    internalMemo: card.internalMemo,
    guestMemo: card.guestMemo,
    arrivalTime: card.arrivalTime,
    vehicleCount: card.vehicleCount,
    assignmentStatus: card.assignmentStatus,
    assignedRooms: card.assignedRooms,
    companionPending: card.companionPending,
    companionGuestRequired: card.companionGuestRequired,
    email: card.email,
    completionEmailSent: card.completionEmailSent,
    day11EmailSent: card.day11EmailSent,
    day3EmailSent: card.day3EmailSent,
    companionFormAnswered: card.companionFormAnswered,
    createdAt: card.createdAt,
    sheetCreatedAt: card.sheetCreatedAt,
    updatedAt: card.updatedAt,
    nightNumber: card.nightNumber,
  };
}

export function ReservationDashboardCard({
  item,
  nightNumber,
  detailFrom = "home",
}: {
  item: DashboardListItem;
  nightNumber?: number;
  /** 詳細画面の from クエリ（ホーム／予定で戻り先を分ける） */
  detailFrom?: "home" | "calendar";
}) {
  const normalized = item;
  const displayNight = nightNumber ?? normalized.nightNumber;

  const compact = formatGuestCompact({
    guest_total: normalized.guestTotal,
    adult_male: normalized.adultMale,
    adult_female: normalized.adultFemale,
    boy_student: normalized.boyStudent,
    girl_student: normalized.girlStudent,
    age_3plus: normalized.age3plus,
    under_3: normalized.under3,
  });
  const displayName = formatDisplayName(normalized.representativeName);

  return (
    <Link
      href={`/reservations/${encodeURIComponent(normalized.reservationId)}?from=${detailFrom}`}
      className="card list-card reservation-row-card block"
    >
      <div className="row-card-head">
        <p className="card-title list-card-title">{displayName}</p>
        <div className="row-card-status-row">
          <ReservationListStatusActions
            reservationId={normalized.reservationId}
            status={normalized.status}
            updatedAt={normalized.updatedAt}
          />
        </div>
      </div>
      <p className="card-sub">
        {normalized.reservationId} / {normalized.checkIn}〜{normalized.checkOut}
        {displayNight ? ` / ${displayNight}泊目` : ""}
      </p>
      <ReservationTaskChips
        item={{
          status: normalized.status,
          email: normalized.email,
          check_in: normalized.checkIn,
          check_out: normalized.checkOut,
          created_at: normalized.createdAt,
          sheet_created_at: normalized.sheetCreatedAt,
          assignment_status: normalized.assignmentStatus,
          companion_required: normalized.companionGuestRequired,
          companion_pending: normalized.companionPending,
          completion_email_sent: normalized.completionEmailSent,
          day11_email_sent: normalized.day11EmailSent,
          day3_email_sent: normalized.day3EmailSent,
          companion_form_answered: normalized.companionFormAnswered,
          guest_total: normalized.guestTotal,
          adult_male: normalized.adultMale,
          adult_female: normalized.adultFemale,
          boy_student: normalized.boyStudent,
          girl_student: normalized.girlStudent,
          age_3plus: normalized.age3plus,
          under_3: normalized.under3,
        }}
      />
      <ListCardStayDetails
        guests={compact}
        rooms={normalized.assignedRooms}
        arrivalTime={normalized.arrivalTime}
        meal={normalized.meal}
        bbq={normalized.bbq}
        somen={normalized.somen}
        vehicleCount={normalized.vehicleCount}
        inquiry={normalized.inquiry}
        internalMemo={normalized.internalMemo}
        guestMemo={normalized.guestMemo}
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
