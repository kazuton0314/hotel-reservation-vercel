import {
  daysBetweenCalendarDates,
  parseReservationDate,
} from "@/lib/utils/date-label";
import { effectiveGuestCountForCompanion } from "@/lib/utils/guest-display";
import { stripTime } from "@/lib/import/date-utils";

export type MailKindStatus = {
  kind: string;
  label: string;
  applicable: boolean;
  notRequired: boolean;
  pending: boolean;
  sent: boolean;
  sentAtStr: string;
  reason: string;
};

type ReservationMailRow = {
  status: string;
  email: string | null;
  check_in: string | null;
  check_out: string | null;
  created_at?: string | null;
  sheet_created_at?: string | null;
  completion_email_sent: boolean;
  day11_email_sent: boolean;
  day3_email_sent: boolean;
  completion_email_sent_at?: string | null;
  day11_email_sent_at?: string | null;
  day3_email_sent_at?: string | null;
  companion_form_answered: boolean;
  guest_total: string | null;
  adult_male: string | null;
  adult_female: string | null;
  boy_student: string | null;
  girl_student: string | null;
  age_3plus: string | null;
  under_3: string | null;
};

function formatSentAt(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString("ja-JP");
}

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

function isConfirmedReservation(r: ReservationMailRow): boolean {
  return r.status === "確定";
}

export function buildReservationMailKindStatus(
  r: ReservationMailRow,
  kind: "予約確定" | "11日前" | "3日前",
  refDate: Date = new Date()
): MailKindStatus {
  const lead = reservationBookingLeadDays(r);
  const daysUntil = reservationDaysUntilCheckIn(r, refDate);
  const confirmed = isConfirmedReservation(r);

  if (kind === "予約確定") {
    const sent = r.completion_email_sent;
    return {
      kind,
      label: "予約確定",
      applicable: confirmed,
      notRequired: !confirmed,
      pending: !sent && ["仮予約", "確定"].includes(r.status),
      sent,
      sentAtStr: formatSentAt(r.completion_email_sent_at),
      reason: "",
    };
  }

  if (kind === "11日前") {
    const sent = r.day11_email_sent;
    const sentAtStr = formatSentAt(r.day11_email_sent_at);
    const eligible = lead >= 11;
    if (!confirmed) {
      return {
        kind,
        label: "11日前",
        applicable: false,
        notRequired: true,
        pending: false,
        sent,
        sentAtStr,
        reason: "",
      };
    }
    if (!eligible) {
      return {
        kind,
        label: "11日前",
        applicable: false,
        notRequired: true,
        pending: false,
        sent,
        sentAtStr,
        reason: "予約が11日以内",
      };
    }
    if (sent) {
      return {
        kind,
        label: "11日前",
        applicable: true,
        notRequired: false,
        pending: false,
        sent: true,
        sentAtStr,
        reason: "",
      };
    }
    const inWindow =
      daysUntil !== null && daysUntil <= 11 && daysUntil >= 0;
    return {
      kind,
      label: "11日前",
      applicable: true,
      notRequired: false,
      pending: inWindow,
      sent: false,
      sentAtStr: "",
      reason: "",
    };
  }

  const sent = r.day3_email_sent;
  const sentAtStr = formatSentAt(r.day3_email_sent_at);
  const eligible = lead >= 3;
  const companionNeeded =
    effectiveGuestCountForCompanion(r) >= 2 && !r.companion_form_answered;

  if (!confirmed) {
    return {
      kind,
      label: "3日前",
      applicable: false,
      notRequired: true,
      pending: false,
      sent,
      sentAtStr,
      reason: "",
    };
  }
  if (!eligible || !companionNeeded) {
    return {
      kind,
      label: "3日前",
      applicable: false,
      notRequired: true,
      pending: false,
      sent,
      sentAtStr,
      reason: !eligible ? "予約が3日以内" : "同行者不要",
    };
  }
  if (sent) {
    return {
      kind,
      label: "3日前",
      applicable: true,
      notRequired: false,
      pending: false,
      sent: true,
      sentAtStr,
      reason: "",
    };
  }
  const inWindow = daysUntil !== null && daysUntil <= 3 && daysUntil >= 0;
  return {
    kind,
    label: "3日前",
    applicable: true,
    notRequired: false,
    pending: inWindow,
    sent: false,
    sentAtStr: "",
    reason: "",
  };
}

export function reservationMailStatuses(
  r: ReservationMailRow,
  refDate?: Date
): {
  confirmation: MailKindStatus;
  day11: MailKindStatus;
  day3: MailKindStatus;
} {
  const d = refDate ?? new Date();
  return {
    confirmation: buildReservationMailKindStatus(r, "予約確定", d),
    day11: buildReservationMailKindStatus(r, "11日前", d),
    day3: buildReservationMailKindStatus(r, "3日前", d),
  };
}
