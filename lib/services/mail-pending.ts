import { stripTime } from "@/lib/import/date-utils";
import {
  daysBetweenCalendarDates,
  businessToday,
  parseReservationDate,
} from "@/lib/utils/date-label";
import { effectiveGuestCountForCompanion } from "@/lib/utils/guest-display";
import {
  reservationHasActiveConfirmationTask,
  type ReservationTaskRow,
} from "@/lib/services/reservation-active-tasks";

const ACTIVE_STATUSES = ["仮予約", "確定"];

type ReservationMailRow = {
  status: string;
  email: string | null;
  check_in: string | null;
  check_out: string | null;
  created_at: string | null;
  sheet_created_at: string | null;
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

function reservationCreatedDate(r: ReservationMailRow): Date | null {
  const raw = r.sheet_created_at || r.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : stripTime(d);
}

function reservationBookingLeadDays(r: ReservationMailRow): number {
  const created = reservationCreatedDate(r);
  const checkIn = parseReservationDate(r.check_in);
  if (!created || !checkIn) return 0;
  return daysBetweenCalendarDates(created, checkIn);
}

function reservationDaysUntilCheckIn(
  r: ReservationMailRow,
  refDate: Date
): number | null {
  const checkIn = parseReservationDate(r.check_in);
  if (!checkIn) return null;
  return daysBetweenCalendarDates(stripTime(refDate), checkIn);
}

export function reservationNeedsCompletionEmail(r: ReservationMailRow): boolean {
  if (!r.email) return false;
  if (r.completion_email_sent) return false;
  return ACTIVE_STATUSES.includes(r.status);
}

function reservationNeedsDay11Email(
  r: ReservationMailRow,
  refDate: Date
): boolean {
  if (!r.email || r.status !== "確定") return false;
  if (r.day11_email_sent) return false;
  const lead = reservationBookingLeadDays(r);
  if (lead < 11) return false;
  const daysUntil = reservationDaysUntilCheckIn(r, refDate);
  return daysUntil !== null && daysUntil <= 11 && daysUntil >= 0;
}

function reservationNeedsDay3Email(
  r: ReservationMailRow,
  refDate: Date
): boolean {
  if (!r.email || r.status !== "確定") return false;
  if (r.day3_email_sent) return false;
  const companionNeeded =
    effectiveGuestCountForCompanion(r) >= 2 && !r.companion_form_answered;
  if (!companionNeeded) return false;
  const daysUntil = reservationDaysUntilCheckIn(r, refDate);
  return daysUntil !== null && daysUntil <= 3 && daysUntil >= 0;
}

export function reservationHasAnyMailPending(
  r: ReservationMailRow,
  refDate: Date = businessToday()
): boolean {
  return reservationHasActiveConfirmationTask(
    r as ReservationTaskRow,
    refDate
  );
}

export function reservationNeedsCompanionInfo(
  r: ReservationMailRow,
  referenceDate: Date = businessToday()
): boolean {
  if (!ACTIVE_STATUSES.includes(r.status)) return false;
  if (r.companion_form_answered) return false;
  const checkOut = parseReservationDate(r.check_out);
  const ref = stripTime(referenceDate);
  if (!checkOut || checkOut.getTime() < ref.getTime()) return false;
  return effectiveGuestCountForCompanion(r) >= 2;
}
