import { calculateNights, stripTime } from "@/lib/import/date-utils";
import {
  parseReservationDate,
  todayIso,
  weekdayJa,
} from "@/lib/utils/date-label";

export const UNASSIGNED_ROOM_ID = "__unassigned__";

const ACTIVE_STATUSES = ["仮予約", "確定"] as const;

export type OccGuestFields = {
  status?: string;
  guestCount?: number;
  guestTotal?: string | null;
  adultMale?: string | null;
  adultFemale?: string | null;
  boyStudent?: string | null;
  girlStudent?: string | null;
  age3plus?: string | null;
  under3?: string | null;
  bbq?: string | null;
};

export type OccEvent = OccGuestFields & {
  roomAssignmentId: string;
  assignmentUpdatedAt?: string | null;
  roomId: string;
  reservationId: string;
  representativeName: string;
  isStay: boolean;
  isCheckin: boolean;
  isCheckout: boolean;
  startDateStr: string;
  endDateStr: string;
  isUnassigned?: boolean;
  isDraft?: boolean;
  nightNumber?: number;
  nightsTotal?: number;
};

export type OccCell = {
  roomId: string;
  roomName: string;
  events: OccEvent[];
  isShared: boolean;
  isUnassignedColumn?: boolean;
};

export type OccDay = {
  date: string;
  dayNum: number;
  weekday: string;
  isToday: boolean;
  isWeekend: boolean;
  cells: OccCell[];
};

export type OccRoomColumn = {
  roomId: string;
  roomName: string;
  capacity?: number | null;
  type?: string | null;
  isUnassignedColumn?: boolean;
  monthGuestTotal?: number;
};

export type RoomOccupancyMonthView = {
  year: number;
  month: number;
  monthLabel: string;
  daysInMonth: number;
  rooms: OccRoomColumn[];
  days: OccDay[];
};

type DbRoom = {
  room_id: string;
  room_name: string;
  room_type: string | null;
  capacity: number | null;
  sort_order: number;
};

type DbReservation = {
  reservation_id: string;
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
  bbq: string | null;
  assignment_status: string | null;
};

type DbAssignment = {
  room_assignment_id: string;
  reservation_id: string;
  room_id: string | null;
  stay_start: string;
  stay_end: string;
  assigned_guest_count: number | null;
  male_count: number | null;
  female_count: number | null;
  boy_student_count: number | null;
  girl_student_count: number | null;
  age_3plus_count: number | null;
  under_3_count: number | null;
  updated_at: string | null;
};

function formatDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseGuestCount(value: string | null | undefined): number {
  if (!value) return 0;
  const m = String(value).match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function occNightFieldsForDay(
  res: DbReservation | undefined,
  dayMs: number,
  iso: string
): { nightNumber?: number; nightsTotal?: number } {
  if (!res?.check_in) return {};
  const ci = parseReservationDate(res.check_in);
  if (!ci) return {};
  const checkOutIso = res.check_out ?? "";
  if (iso && checkOutIso && iso === checkOutIso) return {};
  const ciMs = stripTime(ci).getTime();
  let nightNumber = Math.max(1, Math.round((dayMs - ciMs) / 86400000) + 1);
  const ciDate = parseReservationDate(res.check_in);
  const coDate = parseReservationDate(res.check_out);
  const total =
    res.nights ||
    (ciDate && coDate ? calculateNights(ciDate, coDate) : 0);
  if (total > 0) nightNumber = Math.min(nightNumber, total);
  return {
    nightNumber,
    nightsTotal: total > 0 ? total : nightNumber,
  };
}

function occGuestFieldsFromReservation(
  res: DbReservation | undefined,
  guestCountOverride?: number | null
): OccGuestFields {
  return {
    status: res?.status ?? "",
    guestCount:
      guestCountOverride != null
        ? guestCountOverride
        : res
          ? parseGuestCount(res.guest_total)
          : 0,
    guestTotal: res?.guest_total ?? (guestCountOverride ? String(guestCountOverride) : null),
    adultMale: res?.adult_male ?? null,
    adultFemale: res?.adult_female ?? null,
    boyStudent: res?.boy_student ?? null,
    girlStudent: res?.girl_student ?? null,
    age3plus: res?.age_3plus ?? null,
    under3: res?.under_3 ?? null,
    bbq: res?.bbq ?? null,
  };
}

function assignmentBreakdownSum(assignment: DbAssignment): number {
  return (
    (Number(assignment.male_count) || 0) +
    (Number(assignment.female_count) || 0) +
    (Number(assignment.boy_student_count) || 0) +
    (Number(assignment.girl_student_count) || 0) +
    (Number(assignment.age_3plus_count) || 0) +
    (Number(assignment.under_3_count) || 0)
  );
}

function assignmentHasRoomBreakdown(assignment: DbAssignment): boolean {
  return (
    assignment.male_count != null ||
    assignment.female_count != null ||
    assignment.boy_student_count != null ||
    assignment.girl_student_count != null ||
    assignment.age_3plus_count != null ||
    assignment.under_3_count != null ||
    assignmentBreakdownSum(assignment) > 0
  );
}

/**
 * 表示: 宿泊人数（予約合計）+ 部屋割ごとの人数内訳。
 * 例: 20~25人(男10) / 20~25人(女5)
 */
function occGuestFieldsFromAssignment(
  assignment: DbAssignment,
  res: DbReservation | undefined
): OccGuestFields {
  const roomGuestCount =
    assignmentBreakdownSum(assignment) ||
    Number(assignment.assigned_guest_count) ||
    0;

  if (!assignmentHasRoomBreakdown(assignment)) {
    // 旧データなどで部屋内訳が無いときだけ予約内訳へフォールバック
    return occGuestFieldsFromReservation(res, roomGuestCount || null);
  }

  return {
    status: res?.status ?? "",
    guestCount: roomGuestCount || undefined,
    guestTotal:
      res?.guest_total ??
      (assignment.assigned_guest_count != null
        ? String(assignment.assigned_guest_count)
        : null),
    adultMale:
      assignment.male_count != null ? String(assignment.male_count) : null,
    adultFemale:
      assignment.female_count != null ? String(assignment.female_count) : null,
    boyStudent:
      assignment.boy_student_count != null
        ? String(assignment.boy_student_count)
        : null,
    girlStudent:
      assignment.girl_student_count != null
        ? String(assignment.girl_student_count)
        : null,
    age3plus:
      assignment.age_3plus_count != null
        ? String(assignment.age_3plus_count)
        : null,
    under3:
      assignment.under_3_count != null
        ? String(assignment.under_3_count)
        : null,
    bbq: res?.bbq ?? null,
  };
}

export function sortOccCellEvents(events: OccEvent[]): OccEvent[] {
  return events.slice().sort((a, b) => {
    const rank = (ev: OccEvent) => {
      if (ev.isCheckout && !ev.isCheckin) return 0;
      if (ev.isCheckin && ev.isCheckout) return 1;
      if (ev.isCheckin) return 2;
      return 3;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return String(a.representativeName || "").localeCompare(
      String(b.representativeName || ""),
      "ja"
    );
  });
}

/**
 * 相部屋判定。
 * 同日の OUT→IN 入れ替えだけでは相部屋にしない。
 * 「その日の宿泊（滞在 or チェックイン）」が複数予約にまたがるときだけ true。
 */
export function isSharedRoomEvents(events: OccEvent[]): boolean {
  if (!events || events.length < 2) return false;
  const overnightIds = new Set(
    events
      .filter((ev) => ev.isStay || ev.isCheckin)
      .map((ev) => ev.reservationId)
      .filter(Boolean)
  );
  return overnightIds.size > 1;
}

function buildUnassignedOccEventsForDay(
  reservations: DbReservation[],
  dayMs: number,
  iso: string
): OccEvent[] {
  const events: OccEvent[] = [];
  for (const r of reservations) {
    if (!ACTIVE_STATUSES.includes(r.status as (typeof ACTIVE_STATUSES)[number])) {
      continue;
    }
    if (r.assignment_status !== "未割当") continue;

    const checkIn = parseReservationDate(r.check_in);
    const checkOut = parseReservationDate(r.check_out);
    const checkInMs = checkIn ? stripTime(checkIn).getTime() : 0;
    const checkOutMs = checkOut ? stripTime(checkOut).getTime() : 0;
    const isStay = checkInMs <= dayMs && dayMs < checkOutMs;
    const isCheckin = r.check_in === iso;
    const isCheckout = r.check_out === iso;
    if (!isStay && !isCheckin && !isCheckout) continue;

    events.push({
      roomAssignmentId: "",
      roomId: UNASSIGNED_ROOM_ID,
      reservationId: r.reservation_id,
      representativeName: r.representative_name ?? "—",
      isStay,
      isCheckin,
      isCheckout,
      startDateStr: r.check_in ?? "",
      endDateStr: r.check_out ?? "",
      isUnassigned: true,
      ...occGuestFieldsFromReservation(r),
      ...occNightFieldsForDay(r, dayMs, iso),
    });
  }
  return sortOccCellEvents(events);
}

function computeRoomMonthGuestTotals(
  reservationsById: Map<string, DbReservation>,
  assignments: DbAssignment[],
  rooms: DbRoom[],
  year: number,
  month: number
): Record<string, { count: number; seen: Record<string, boolean> }> {
  const monthStartMs = new Date(year, month - 1, 1).getTime();
  const monthEndMs = new Date(year, month, 0).getTime();
  const totals: Record<string, { count: number; seen: Record<string, boolean> }> =
    {};
  for (const room of rooms) {
    totals[room.room_id] = { count: 0, seen: {} };
  }

  for (const a of assignments) {
    const res = reservationsById.get(a.reservation_id);
    if (res && (res.status === "キャンセル" || res.status === "不可")) continue;
    const start = parseReservationDate(a.stay_start);
    const end = parseReservationDate(a.stay_end);
    const startMs = start ? stripTime(start).getTime() : 0;
    const endMs = end ? stripTime(end).getTime() : 0;
    if (endMs <= monthStartMs || startMs > monthEndMs) continue;
    const roomId = a.room_id;
    if (!roomId || !totals[roomId]) continue;
    if (totals[roomId].seen[a.reservation_id]) continue;
    totals[roomId].seen[a.reservation_id] = true;
    const roomSum =
      (Number(a.male_count) || 0) +
      (Number(a.female_count) || 0) +
      (Number(a.boy_student_count) || 0) +
      (Number(a.girl_student_count) || 0) +
      (Number(a.age_3plus_count) || 0) +
      (Number(a.under_3_count) || 0);
    totals[roomId].count +=
      roomSum ||
      Number(a.assigned_guest_count) ||
      (res ? parseGuestCount(res.guest_total) : 0);
  }
  return totals;
}

function computeUnassignedMonthGuestTotal(
  reservations: DbReservation[],
  year: number,
  month: number
): number {
  const monthStartMs = new Date(year, month - 1, 1).getTime();
  const monthEndMs = new Date(year, month, 0).getTime();
  let count = 0;
  const seen: Record<string, boolean> = {};
  for (const r of reservations) {
    if (!ACTIVE_STATUSES.includes(r.status as (typeof ACTIVE_STATUSES)[number])) {
      continue;
    }
    if (r.assignment_status !== "未割当") continue;
    const checkIn = parseReservationDate(r.check_in);
    const checkOut = parseReservationDate(r.check_out);
    const startMs = checkIn ? stripTime(checkIn).getTime() : 0;
    const endMs = checkOut ? stripTime(checkOut).getTime() : 0;
    if (endMs <= monthStartMs || startMs > monthEndMs) continue;
    if (seen[r.reservation_id]) continue;
    seen[r.reservation_id] = true;
    count += parseGuestCount(r.guest_total);
  }
  return count;
}

export function buildRoomOccupancyMonthView(
  year: number,
  month: number,
  rooms: DbRoom[],
  reservations: DbReservation[],
  assignments: DbAssignment[]
): RoomOccupancyMonthView {
  const reservationsById = new Map(reservations.map((r) => [r.reservation_id, r]));
  const assignmentsByRoomId = new Map<string, DbAssignment[]>();
  for (const a of assignments) {
    if (!a.room_id) continue;
    const list = assignmentsByRoomId.get(a.room_id) ?? [];
    list.push(a);
    assignmentsByRoomId.set(a.room_id, list);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const todayIsoStr = todayIso();
  const days: OccDay[] = [];
  const nightsByRoom: Record<string, number> = {};
  for (const room of rooms) {
    nightsByRoom[room.room_id] = 0;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const iso = formatDateIso(date);
    const dayMs = stripTime(date).getTime();
    const cells: OccCell[] = [];

    const unassignedEvents = buildUnassignedOccEventsForDay(
      reservations,
      dayMs,
      iso
    );
    cells.push({
      roomId: UNASSIGNED_ROOM_ID,
      roomName: "未割当",
      events: unassignedEvents,
      isShared: false,
      isUnassignedColumn: true,
    });

    for (const room of rooms) {
      const events: OccEvent[] = [];
      const roomAssignments = assignmentsByRoomId.get(room.room_id) ?? [];

      for (const a of roomAssignments) {
        const res = reservationsById.get(a.reservation_id);
        if (res && (res.status === "キャンセル" || res.status === "不可")) {
          continue;
        }

        const start = parseReservationDate(a.stay_start);
        const end = parseReservationDate(a.stay_end);
        const startMs = start ? stripTime(start).getTime() : 0;
        const endMs = end ? stripTime(end).getTime() : 0;
        const isStay = startMs <= dayMs && dayMs < endMs;
        const isCheckin = a.stay_start === iso;
        const isCheckout = a.stay_end === iso;
        if (!isStay && !isCheckin && !isCheckout) continue;

        if (isStay) nightsByRoom[room.room_id]++;

        events.push({
          roomAssignmentId: a.room_assignment_id,
          assignmentUpdatedAt: a.updated_at,
          roomId: a.room_id ?? room.room_id,
          reservationId: a.reservation_id,
          representativeName: res?.representative_name ?? "—",
          isStay,
          isCheckin,
          isCheckout,
          startDateStr: a.stay_start,
          endDateStr: a.stay_end,
          ...occGuestFieldsFromAssignment(a, res),
          ...occNightFieldsForDay(res, dayMs, iso),
        });
      }

      sortOccCellEvents(events);
      cells.push({
        roomId: room.room_id,
        roomName: room.room_name,
        events,
        isShared: isSharedRoomEvents(events),
      });
    }

    days.push({
      date: iso,
      dayNum: d,
      weekday: weekdayJa(date),
      isToday: iso === todayIsoStr,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      cells,
    });
  }

  const guestTotals = computeRoomMonthGuestTotals(
    reservationsById,
    assignments,
    rooms,
    year,
    month
  );
  const unassignedGuestTotal = computeUnassignedMonthGuestTotal(
    reservations,
    year,
    month
  );

  const roomColumns: OccRoomColumn[] = [
    {
      roomId: UNASSIGNED_ROOM_ID,
      roomName: "未割当",
      isUnassignedColumn: true,
      monthGuestTotal: unassignedGuestTotal,
    },
    ...rooms.map((room) => ({
      roomId: room.room_id,
      roomName: room.room_name,
      capacity: room.capacity,
      type: room.room_type,
      monthGuestTotal: guestTotals[room.room_id]?.count ?? 0,
    })),
  ];

  return {
    year,
    month,
    monthLabel: `${year}年${month}月`,
    daysInMonth,
    rooms: roomColumns,
    days,
  };
}
