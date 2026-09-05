import { stripTime } from "@/lib/import/date-utils";
import {
  daysBetweenCalendarDates,
  formatDateJa,
  businessToday,
  parseReservationDate,
  todayIso,
  weekdayJa,
} from "@/lib/utils/date-label";
import { formatGuestCompact, formatGuestCountWithInfants, guestMainCount, guestUnder3Count, effectiveGuestCountForCompanion } from "@/lib/utils/guest-display";
import { reservationNeedsCompanionInfo } from "@/lib/services/mail-pending";
import type { TodayRoomBoardItem } from "@/lib/queries/dashboard";

const ACTIVE_STATUSES = ["仮予約", "確定"] as const;

export type CalendarReservation = {
  reservation_id: string;
  request_id: string | null;
  representative_name: string | null;
  status: string;
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  guest_total: string | null;
  adult_male: string | null;
  adult_female: string | null;
  boy_student: string | null;
  girl_student: string | null;
  age_3plus: string | null;
  under_3: string | null;
  arrival_time: string | null;
  meal: string | null;
  bbq: string | null;
  somen: string | null;
  channel: string | null;
  inquiry: string | null;
  internal_memo: string | null;
  guest_memo: string | null;
  assignment_status: string | null;
  vehicle_count: string | null;
  companion_form_answered: boolean;
  email: string | null;
  completion_email_sent: boolean;
  day11_email_sent: boolean;
  day3_email_sent: boolean;
  created_at: string | null;
  sheet_created_at: string | null;
  updated_at: string | null;
};

export type CalendarAssignment = {
  room_assignment_id: string;
  reservation_id: string;
  room_id: string | null;
  room_name: string | null;
  stay_start: string;
  stay_end: string;
  assigned_guest_count?: number | null;
  male_count?: number | null;
  female_count?: number | null;
  boy_student_count?: number | null;
  girl_student_count?: number | null;
  age_3plus_count?: number | null;
  under_3_count?: number | null;
};

export type CalendarEvent = {
  reservationId: string;
  representativeName: string;
  guestCompact: string;
  status: string;
  type: "checkin" | "checkout" | "stay";
  typeLabel: string;
  time: string;
  date: string;
  rooms: string;
  nightNumber?: number;
};

export type CalendarDayCard = {
  reservationId: string;
  representativeName: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guestTotal: string | null;
  adultMale: string | null;
  adultFemale: string | null;
  boyStudent: string | null;
  girlStudent: string | null;
  age3plus: string | null;
  under3: string | null;
  arrivalTime: string | null;
  assignmentStatus: string | null;
  assignedRooms: string;
  meal: string | null;
  bbq: string | null;
  somen: string | null;
  inquiry: string | null;
  requestInquiry: string | null;
  internalMemo: string | null;
  guestMemo: string | null;
  vehicleCount: string | null;
  companionPending: boolean;
  companionGuestRequired: boolean;
  email: string | null;
  completionEmailSent: boolean;
  day11EmailSent: boolean;
  day3EmailSent: boolean;
  companionFormAnswered: boolean;
  createdAt: string | null;
  sheetCreatedAt: string | null;
  updatedAt: string | null;
  nightNumber?: number;
};

export type MonthCalendarView = {
  year: number;
  month: number;
  days: {
    date: string;
    dayNum: number;
    isToday: boolean;
    /** 例: IN(1組4人) */
    checkinLabel: string;
    checkoutLabel: string;
    stayingLabel: string;
    eventName: string;
  }[];
  gridStartOffset: number;
  weekdayHeaders: string[];
};

export type WeekCalendarView = {
  weekStart: string;
  weekEnd: string;
  days: {
    date: string;
    dateLabel: string;
    weekday: string;
    isToday: boolean;
    checkinLabel: string;
    checkoutLabel: string;
    stayingLabel: string;
    events: CalendarEvent[];
  }[];
};

export type DayCalendarView = {
  date: string;
  dateLabel: string;
  checkinCards: CalendarDayCard[];
  checkoutCards: CalendarDayCard[];
  staying: CalendarDayCard[];
  todayRooms: TodayRoomBoardItem[];
};

function formatDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function guestCompactFromReservation(r: CalendarReservation): string {
  return formatGuestCompact({
    guest_total: r.guest_total,
    adult_male: r.adult_male,
    adult_female: r.adult_female,
    boy_student: r.boy_student,
    girl_student: r.girl_student,
    age_3plus: r.age_3plus,
    under_3: r.under_3,
  });
}

function getAssignedRoomsLabel(
  reservationId: string,
  assignmentsByReservation: Map<string, CalendarAssignment[]>
): string {
  const list = assignmentsByReservation.get(reservationId) ?? [];
  const names = list
    .map((a) => a.room_name || a.room_id)
    .filter(Boolean) as string[];
  return names.join(" / ");
}

function isActiveReservation(r: CalendarReservation): boolean {
  return (
    ACTIVE_STATUSES.includes(r.status as (typeof ACTIVE_STATUSES)[number]) &&
    !!r.check_in &&
    !!r.check_out
  );
}

function isStayingOn(r: CalendarReservation, iso: string): boolean {
  if (!isActiveReservation(r)) return false;
  const ci = parseReservationDate(r.check_in);
  const co = parseReservationDate(r.check_out);
  if (!ci || !co) return false;
  const dayMs = stripTime(parseReservationDate(iso)!).getTime();
  const startMs = stripTime(ci).getTime();
  const endMs = stripTime(co).getTime();
  // チェックイン当日は「滞在中」に含めない（ホーム画面と同じ）
  return startMs < dayMs && dayMs < endMs;
}

function partyCountSummary(list: CalendarReservation[]): string {
  if (!list.length) return "";
  let main = 0;
  let under3 = 0;
  for (const r of list) {
    main += guestMainCount(r);
    under3 += guestUnder3Count(r);
  }
  const guests = formatGuestCountWithInfants(main, under3);
  return guests ? `${list.length}組${guests}人` : `${list.length}組`;
}

/** 例: IN(1組4人) / OUT(3組20+1人) */
function calPartyBadge(
  prefix: string,
  list: CalendarReservation[]
): string {
  const summary = partyCountSummary(list);
  return summary ? `${prefix}(${summary})` : "";
}

function dayPartyLabels(reservations: CalendarReservation[], iso: string) {
  const checkins = reservations.filter(
    (r) => isActiveReservation(r) && r.check_in === iso
  );
  const checkouts = reservations.filter(
    (r) => isActiveReservation(r) && r.check_out === iso
  );
  const staying = reservations.filter((r) => isStayingOn(r, iso));
  return {
    checkinLabel: calPartyBadge("IN", checkins),
    checkoutLabel: calPartyBadge("OUT", checkouts),
    stayingLabel: calPartyBadge("滞", staying),
  };
}

function stayNightNumber(r: CalendarReservation, iso: string): number {
  const ci = parseReservationDate(r.check_in);
  const day = parseReservationDate(iso);
  if (!ci || !day) return 1;
  let nightNumber = Math.max(
    1,
    Math.round((stripTime(day).getTime() - stripTime(ci).getTime()) / 86400000) + 1
  );
  const total =
    r.nights ||
    (r.check_in && r.check_out
      ? daysBetweenCalendarDates(
          parseReservationDate(r.check_in)!,
          parseReservationDate(r.check_out)!
        )
      : 0);
  if (total > 0) nightNumber = Math.min(nightNumber, total);
  return nightNumber;
}

const WEEK_EVENT_TYPE_RANK: Record<CalendarEvent["type"], number> = {
  checkin: 0,
  stay: 1,
  checkout: 2,
};

export function buildCalendarEventsForRange(
  reservations: CalendarReservation[],
  assignmentsByReservation: Map<string, CalendarAssignment[]>,
  dateFrom: string,
  dateTo: string
): CalendarEvent[] {
  const from = parseReservationDate(dateFrom);
  const to = parseReservationDate(dateTo);
  if (!from || !to) return [];

  const events: CalendarEvent[] = [];
  for (const r of reservations) {
    if (!isActiveReservation(r)) continue;
    const ci = parseReservationDate(r.check_in);
    const co = parseReservationDate(r.check_out);
    if (!ci || !co) continue;
    if (
      stripTime(ci).getTime() > stripTime(to).getTime() ||
      stripTime(co).getTime() < stripTime(from).getTime()
    ) {
      continue;
    }

    const base = {
      reservationId: r.reservation_id,
      representativeName: r.representative_name ?? "—",
      guestCompact: guestCompactFromReservation(r),
      status: r.status,
      rooms: getAssignedRoomsLabel(r.reservation_id, assignmentsByReservation),
    };

    const ciIso = r.check_in!;
    const coIso = r.check_out!;
    if (ciIso >= dateFrom && ciIso <= dateTo) {
      events.push({
        ...base,
        date: ciIso,
        type: "checkin",
        typeLabel: "チェックイン",
        time: r.arrival_time || "",
      });
    }

    const stayDay = new Date(stripTime(ci));
    stayDay.setDate(stayDay.getDate() + 1);
    const coMs = stripTime(co).getTime();
    while (stayDay.getTime() < coMs) {
      const iso = formatDateIso(stayDay);
      if (iso >= dateFrom && iso <= dateTo) {
        events.push({
          ...base,
          date: iso,
          type: "stay",
          typeLabel: "滞在中",
          time: "",
          nightNumber: stayNightNumber(r, iso),
        });
      }
      stayDay.setDate(stayDay.getDate() + 1);
    }

    if (coIso >= dateFrom && coIso <= dateTo) {
      events.push({
        ...base,
        date: coIso,
        type: "checkout",
        typeLabel: "チェックアウト",
        time: "",
      });
    }
  }

  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const ra = WEEK_EVENT_TYPE_RANK[a.type];
    const rb = WEEK_EVENT_TYPE_RANK[b.type];
    if (ra !== rb) return ra - rb;
    if (a.type === "checkin") {
      const ta = a.time || "00:00";
      const tb = b.time || "00:00";
      if (ta !== tb) return ta < tb ? -1 : 1;
    }
    return a.representativeName.localeCompare(b.representativeName, "ja");
  });

  return events;
}

function indexEventsByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const map: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    if (!map[e.date]) map[e.date] = [];
    map[e.date].push(e);
  }
  return map;
}

function toDayCard(
  r: CalendarReservation,
  assignmentsByReservation: Map<string, CalendarAssignment[]>,
  refDate: Date,
  requestInquiries: Map<string, string>,
  nightNumber?: number
): CalendarDayCard {
  const guestRequired = effectiveGuestCountForCompanion(r) >= 2;
  const requestId = String(r.request_id ?? "").trim();
  return {
    reservationId: r.reservation_id,
    representativeName: r.representative_name ?? "—",
    status: r.status,
    checkIn: r.check_in ?? "",
    checkOut: r.check_out ?? "",
    guestTotal: r.guest_total,
    adultMale: r.adult_male,
    adultFemale: r.adult_female,
    boyStudent: r.boy_student,
    girlStudent: r.girl_student,
    age3plus: r.age_3plus,
    under3: r.under_3,
    arrivalTime: r.arrival_time,
    assignmentStatus: r.assignment_status,
    assignedRooms: getAssignedRoomsLabel(
      r.reservation_id,
      assignmentsByReservation
    ),
    meal: r.meal,
    bbq: r.bbq,
    somen: r.somen,
    inquiry: r.inquiry,
    requestInquiry: requestId ? (requestInquiries.get(requestId) ?? null) : null,
    internalMemo: r.internal_memo,
    guestMemo: r.guest_memo,
    vehicleCount: r.vehicle_count,
    companionPending: reservationNeedsCompanionInfo(r, refDate),
    companionGuestRequired: guestRequired,
    email: r.email,
    completionEmailSent: r.completion_email_sent,
    day11EmailSent: r.day11_email_sent,
    day3EmailSent: r.day3_email_sent,
    companionFormAnswered: r.companion_form_answered,
    createdAt: r.created_at,
    sheetCreatedAt: r.sheet_created_at,
    updatedAt: r.updated_at,
    nightNumber,
  };
}

export function buildMonthCalendarView(
  year: number,
  month: number,
  reservations: CalendarReservation[],
  _assignmentsByReservation: Map<string, CalendarAssignment[]>
): MonthCalendarView {
  const lastDay = new Date(year, month, 0);
  const todayIsoStr = todayIso();
  const firstDate = new Date(year, month - 1, 1);
  const gridStartOffset = (firstDate.getDay() + 6) % 7;
  const days: MonthCalendarView["days"] = [];

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month - 1, d);
    const iso = formatDateIso(date);
    const labels = dayPartyLabels(reservations, iso);
    days.push({
      date: iso,
      dayNum: d,
      isToday: iso === todayIsoStr,
      ...labels,
      eventName: "",
    });
  }

  return {
    year,
    month,
    days,
    gridStartOffset,
    weekdayHeaders: ["月", "火", "水", "木", "金", "土", "日"],
  };
}

export function buildWeekCalendarView(
  anchorDate: string,
  reservations: CalendarReservation[],
  assignmentsByReservation: Map<string, CalendarAssignment[]>
): WeekCalendarView {
  const anchor = parseReservationDate(anchorDate) || businessToday();
  const day = anchor.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + diffToMon);
  const weekEndDate = new Date(monday);
  weekEndDate.setDate(monday.getDate() + 6);
  const weekStart = formatDateIso(monday);
  const weekEnd = formatDateIso(weekEndDate);
  const allEvents = buildCalendarEventsForRange(
    reservations,
    assignmentsByReservation,
    weekStart,
    weekEnd
  );
  const eventsByDate = indexEventsByDate(allEvents);
  const todayIsoStr = todayIso();
  const days: WeekCalendarView["days"] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = formatDateIso(d);
    const events = eventsByDate[iso] || [];
    const labels = dayPartyLabels(reservations, iso);
    days.push({
      date: iso,
      dateLabel: `${d.getMonth() + 1}/${d.getDate()}`,
      weekday: weekdayJa(d),
      isToday: iso === todayIsoStr,
      ...labels,
      events,
    });
  }

  return { weekStart, weekEnd, days };
}

export function buildDayCalendarView(
  date: string,
  reservations: CalendarReservation[],
  assignmentsByReservation: Map<string, CalendarAssignment[]>,
  todayRooms: TodayRoomBoardItem[],
  requestInquiries: Map<string, string> = new Map()
): DayCalendarView {
  const d = parseReservationDate(date) || businessToday();
  const iso = formatDateIso(d);
  const refDate = d;

  const checkinCards = reservations
    .filter((r) => isActiveReservation(r) && r.check_in === iso)
    .map((r) => toDayCard(r, assignmentsByReservation, refDate, requestInquiries))
    .sort((a, b) => {
      const at = a.arrivalTime ?? "";
      const bt = b.arrivalTime ?? "";
      if (at !== bt) return at < bt ? -1 : 1;
      return a.representativeName.localeCompare(b.representativeName, "ja");
    });

  const checkoutCards = reservations
    .filter((r) => isActiveReservation(r) && r.check_out === iso)
    .map((r) => toDayCard(r, assignmentsByReservation, refDate, requestInquiries))
    .sort((a, b) => {
      const at = a.arrivalTime?.trim() ?? "";
      const bt = b.arrivalTime?.trim() ?? "";
      if (at !== bt) {
        if (!at) return 1;
        if (!bt) return -1;
        return at < bt ? -1 : 1;
      }
      return a.representativeName.localeCompare(b.representativeName, "ja");
    });

  const staying = reservations
    .filter((r) => isStayingOn(r, iso))
    .map((r) =>
      toDayCard(
        r,
        assignmentsByReservation,
        refDate,
        requestInquiries,
        stayNightNumber(r, iso)
      )
    )
    .sort((a, b) => {
      const at = a.arrivalTime?.trim() ?? "";
      const bt = b.arrivalTime?.trim() ?? "";
      if (at !== bt) {
        if (!at) return 1;
        if (!bt) return -1;
        return at < bt ? -1 : 1;
      }
      return a.representativeName.localeCompare(b.representativeName, "ja");
    });

  return {
    date: iso,
    dateLabel: `${formatDateJa(d)}（${weekdayJa(d)}）`,
    checkinCards,
    checkoutCards,
    staying,
    todayRooms,
  };
}

export function defaultCalendarAnchor(): string {
  return todayIso();
}

export function shiftIsoDate(iso: string, days: number): string {
  const d = parseReservationDate(iso) || businessToday();
  d.setDate(d.getDate() + days);
  return formatDateIso(d);
}

export function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
