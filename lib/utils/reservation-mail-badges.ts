import type { ReservationListItem } from "@/lib/queries/reservations";
import { reservationMailStatuses } from "@/lib/utils/mail-kind-status";

export type ReservationMailSource = {
  status: string;
  email: string | null;
  check_in: string | null;
  check_out: string | null;
  completion_email_sent: boolean;
  day11_email_sent: boolean;
  day3_email_sent: boolean;
  companion_form_answered: boolean;
  guest_total: string | null;
  adult_male: string | null;
  adult_female: string | null;
  boy_student: string | null;
  girl_student: string | null;
  age_3plus: string | null;
  under_3: string | null;
};

export function reservationMailStatusesFromItem(item: ReservationMailSource) {
  return reservationMailStatuses({
    status: item.status,
    email: item.email,
    check_in: item.check_in,
    check_out: item.check_out,
    completion_email_sent: item.completion_email_sent,
    day11_email_sent: item.day11_email_sent,
    day3_email_sent: item.day3_email_sent,
    companion_form_answered: item.companion_form_answered,
    guest_total: item.guest_total,
    adult_male: item.adult_male,
    adult_female: item.adult_female,
    boy_student: item.boy_student,
    girl_student: item.girl_student,
    age_3plus: item.age_3plus,
    under_3: item.under_3,
  });
}

export function reservationMailStatusesFromListItem(item: ReservationListItem) {
  return reservationMailStatusesFromItem({
    ...item,
    companion_form_answered: !item.companion_pending,
  });
}
