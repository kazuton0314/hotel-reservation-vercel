import type { ReservationListItem } from "@/lib/queries/reservations";
import { ListCardStayDetails } from "@/components/list/ListCardStayDetails";
import { ReservationListStatusActions } from "@/components/reservations/ReservationListStatusActions";
import { ReservationTaskChips } from "@/components/reservations/ReservationTaskChips";
import { PendingLink } from "@/components/ui/PendingLink";
import { formatReceivedDate } from "@/lib/services/reservation-list-filter";
import { formatDisplayName } from "@/lib/utils/display-name";
import { formatGuestCompact } from "@/lib/utils/guest-display";

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
  const displayName = formatDisplayName(item.representative_name);

  return (
    <PendingLink
      href={`/reservations/${encodeURIComponent(item.reservation_id)}`}
      prefetch
      className="card list-card reservation-row-card block"
    >
      <div className="row-card-head">
        <p className="card-title list-card-title">{displayName}</p>
      </div>
      <div className="row-card-status-row">
        <ReservationListStatusActions
          reservationId={item.reservation_id}
          status={item.status}
          updatedAt={item.updated_at}
        />
      </div>
      <p className="card-sub">
        {item.reservation_id} / {item.check_in}〜{item.check_out}
        {received ? ` / 受付 ${received}` : ""}
      </p>
      <ReservationTaskChips
        item={{
          status: item.status,
          email: item.email,
          check_in: item.check_in,
          check_out: item.check_out,
          created_at: item.created_at,
          sheet_created_at: item.sheet_created_at,
          assignment_status: item.assignment_status,
          companion_required: item.companion_required,
          companion_pending: item.companion_pending,
          completion_email_sent: item.completion_email_sent,
          day11_email_sent: item.day11_email_sent,
          day3_email_sent: item.day3_email_sent,
          companion_form_answered: !item.companion_pending,
          guest_total: item.guest_total,
          adult_male: item.adult_male,
          adult_female: item.adult_female,
          boy_student: item.boy_student,
          girl_student: item.girl_student,
          age_3plus: item.age_3plus,
          under_3: item.under_3,
        }}
      />
      <ListCardStayDetails
        guests={compact}
        rooms={item.assigned_rooms}
        arrivalTime={item.arrival_time}
        meal={item.meal}
        bbq={item.bbq}
        vehicleCount={item.vehicle_count}
        inquiry={item.inquiry}
        internalMemo={item.internal_memo}
      />
    </PendingLink>
  );
}
