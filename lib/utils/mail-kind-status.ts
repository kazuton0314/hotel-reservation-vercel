import {
  daysBetweenCalendarDates,
  businessToday,
  parseReservationDate,
} from "@/lib/utils/date-label";
import { effectiveGuestCountForCompanion } from "@/lib/utils/guest-display";
import { stripTime } from "@/lib/import/date-utils";

export type MailKindStatus = {
  kind: string;
  label: string;
  /** 連絡対象になりうる（時期前含む） */
  applicable: boolean;
  /** 詳細で「不要」表示（未連絡時）。連絡済なら false */
  notRequired: boolean;
  /** 今すぐ対応（橙） */
  pending: boolean;
  sent: boolean;
  sentAtStr: string;
  reason: string;
  /** 一覧・ホームのチップに出すか（不要は出さない。済は出す） */
  showOnList: boolean;
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

function companionFollowUpNeeded(r: ReservationMailRow): boolean {
  return (
    effectiveGuestCountForCompanion(r) >= 2 && !r.companion_form_answered
  );
}

/**
 * 予約確定 … 確定したことを伝える（確定なら全員）
 * 11日前 … 受付→CIが11日以上ある人へのリマインド＋キャンセル料案内
 * 3日前 … 同行者未提出の催促（時期が来たら橙で出す。時期前は一覧非表示）
 */
export function buildReservationMailKindStatus(
  r: ReservationMailRow,
  kind: "予約確定" | "11日前" | "3日前",
  refDate: Date = businessToday()
): MailKindStatus {
  const lead = reservationBookingLeadDays(r);
  const daysUntil = reservationDaysUntilCheckIn(r, refDate);
  const confirmed = isConfirmedReservation(r);

  if (kind === "予約確定") {
    const sent = r.completion_email_sent;
    const sentAtStr = formatSentAt(r.completion_email_sent_at);
    if (sent) {
      return {
        kind,
        label: "予約確定",
        applicable: true,
        notRequired: false,
        pending: false,
        sent: true,
        sentAtStr,
        reason: "",
        showOnList: confirmed,
      };
    }
    if (!confirmed) {
      return {
        kind,
        label: "予約確定",
        applicable: false,
        notRequired: true,
        pending: false,
        sent: false,
        sentAtStr: "",
        reason: "確定予約のみ対象",
        showOnList: false,
      };
    }
    return {
      kind,
      label: "予約確定",
      applicable: true,
      notRequired: false,
      pending: true,
      sent: false,
      sentAtStr: "",
      reason: "",
      showOnList: true,
    };
  }

  if (kind === "11日前") {
    const sent = r.day11_email_sent;
    const sentAtStr = formatSentAt(r.day11_email_sent_at);
    const longLead = lead >= 11;

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
        showOnList: true,
      };
    }
    if (!confirmed) {
      return {
        kind,
        label: "11日前",
        applicable: false,
        notRequired: true,
        pending: false,
        sent: false,
        sentAtStr: "",
        reason: "確定予約のみ対象",
        showOnList: false,
      };
    }
    if (!longLead) {
      return {
        kind,
        label: "11日前",
        applicable: false,
        notRequired: true,
        pending: false,
        sent: false,
        sentAtStr: "",
        reason: "受付からCIまで11日未満のため不要",
        showOnList: false,
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
      showOnList: true,
    };
  }

  // 3日前: 同行者催促。時期前は一覧非表示。リード日数は見ない。
  const sent = r.day3_email_sent;
  const sentAtStr = formatSentAt(r.day3_email_sent_at);
  const needsCompanion = companionFollowUpNeeded(r);
  const inWindow =
    daysUntil !== null && daysUntil <= 3 && daysUntil >= 0;

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
      showOnList: true,
    };
  }
  if (!confirmed) {
    return {
      kind,
      label: "3日前",
      applicable: false,
      notRequired: true,
      pending: false,
      sent: false,
      sentAtStr: "",
      reason: "確定予約のみ対象",
      showOnList: false,
    };
  }
  if (!needsCompanion) {
    return {
      kind,
      label: "3日前",
      applicable: false,
      notRequired: true,
      pending: false,
      sent: false,
      sentAtStr: "",
      reason: "同行者連絡不要",
      showOnList: false,
    };
  }
  if (!inWindow) {
    // 催促時期前: 詳細は「不要」、一覧は出さない（灰で待たない）
    return {
      kind,
      label: "3日前",
      applicable: false,
      notRequired: true,
      pending: false,
      sent: false,
      sentAtStr: "",
      reason: "催促時期前",
      showOnList: false,
    };
  }
  return {
    kind,
    label: "3日前",
    applicable: true,
    notRequired: false,
    pending: true,
    sent: false,
    sentAtStr: "",
    reason: "",
    showOnList: true,
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
  const d = refDate ?? businessToday();
  return {
    confirmation: buildReservationMailKindStatus(r, "予約確定", d),
    day11: buildReservationMailKindStatus(r, "11日前", d),
    day3: buildReservationMailKindStatus(r, "3日前", d),
  };
}
