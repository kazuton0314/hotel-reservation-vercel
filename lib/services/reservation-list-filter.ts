import type { ReservationListItem } from "@/lib/queries/reservations";
import {
  hasIndefiniteGuestCount,
  hasMismatchedGuestCount,
} from "@/lib/utils/guest-count-format";
import { CONTACT_LABELS } from "@/lib/config/contact-confirm-labels";

export const UNASSIGNED_ROOM_FILTER = "__unassigned__";

function guestSourceFromItem(r: ReservationListItem) {
  return {
    guest_total: r.guest_total,
    adult_male: r.adult_male,
    adult_female: r.adult_female,
    boy_student: r.boy_student,
    girl_student: r.girl_student,
    age_3plus: r.age_3plus,
    under_3: r.under_3,
  };
}

export function applyReservationListFilter(
  items: ReservationListItem[],
  field?: string,
  value?: string
): ReservationListItem[] {
  if (!field || !value) return items;

  if (field === "roomId") {
    if (value === UNASSIGNED_ROOM_FILTER) {
      return items.filter((r) => r.assignment_status === "未割当");
    }
    return items.filter((r) =>
      r.assignments.some((a) => a.room_id === value)
    );
  }

  if (field === "companionInfo") {
    if (value === "未回答") {
      return items.filter((r) => r.companion_pending);
    }
    if (value === "回答済み") {
      return items.filter(
        (r) => r.companion_required && !r.companion_pending
      );
    }
    return items;
  }

  if (field === "completionEmail") {
    if (
      value === CONTACT_LABELS.filterPending ||
      value === "未確認" ||
      value === "確認未完了"
    ) {
      return items.filter((r) => r.any_mail_pending);
    }
    if (value === CONTACT_LABELS.filterDone || value === "確認済") {
      return items.filter((r) => !r.any_mail_pending);
    }
    return items;
  }

  if (field === "guestTotal") {
    if (value === "不定") {
      return items.filter((r) => hasIndefiniteGuestCount(guestSourceFromItem(r)));
    }
    if (value === "不一致") {
      return items.filter((r) => hasMismatchedGuestCount(guestSourceFromItem(r)));
    }
    if (value === "確定") {
      return items.filter((r) => {
        const src = guestSourceFromItem(r);
        return (
          !hasIndefiniteGuestCount(src) && !hasMismatchedGuestCount(src)
        );
      });
    }
    return items;
  }

  return items.filter((r) => {
    const record = r as Record<string, unknown>;
    return String(record[field] ?? "") === value;
  });
}

export { formatReceivedDateFromMs as formatReceivedDate } from "@/lib/utils/received-date";
