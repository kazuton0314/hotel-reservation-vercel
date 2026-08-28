import { unstable_cache } from "next/cache";
import { jwtSessionErrorMessage } from "@/lib/auth/session-errors";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { createReadClient } from "@/lib/supabase/read";
import { stripTime } from "@/lib/import/date-utils";
import { fetchAssignmentsForReservationIds } from "@/lib/queries/room-assignment-lookup";
import {
  computeDashboardCounts,
  groupAssignmentsByReservation,
  type DashboardAssignmentRow,
  type DashboardCountRow,
} from "@/lib/services/dashboard-counts";
import { reservationNeedsCompanionInfo } from "@/lib/services/mail-pending";
import {
  guestDisplayFieldsFromRoomAssignment,
  occupancyStayBounds,
  sortByCheckoutThenCheckin,
} from "@/lib/services/room-occupancy";
import {
  daysBetweenCalendarDates,
  formatDateLabel,
  businessToday,
  isSameDay,
  parseReservationDate,
  todayIso,
} from "@/lib/utils/date-label";
import { effectiveGuestCountForCompanion } from "@/lib/utils/guest-display";

const ACTIVE_STATUSES = ["仮予約", "確定"];
const STAYING_STATUSES = ["仮予約", "確定"];

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
  arrival_time: string | null;
  meal: string | null;
  bbq: string | null;
  somen: string | null;
  channel: string | null;
  inquiry: string | null;
  internal_memo: string | null;
  guest_memo: string | null;
  vehicle_count: string | null;
  assignment_status: string | null;
  companion_form_answered: boolean;
  email: string | null;
  completion_email_sent: boolean;
  day11_email_sent: boolean;
  day3_email_sent: boolean;
  created_at: string | null;
  sheet_created_at: string | null;
  updated_at: string | null;
  is_archived: boolean;
};

type DbAssignment = {
  room_assignment_id: string;
  reservation_id: string;
  room_id: string | null;
  room_name: string | null;
  stay_start: string;
  stay_end: string;
  assigned_guest_count: number | null;
  male_count: number | null;
  female_count: number | null;
  boy_student_count: number | null;
  girl_student_count: number | null;
  age_3plus_count: number | null;
  under_3_count: number | null;
  is_archived: boolean;
};

type DbRoom = {
  room_id: string;
  room_name: string;
  sort_order: number;
};

export type DashboardListItem = {
  reservationId: string;
  representativeName: string | null;
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
  meal: string | null;
  bbq: string | null;
  somen: string | null;
  inquiry: string | null;
  internalMemo: string | null;
  guestMemo: string | null;
  arrivalTime: string | null;
  vehicleCount: string | null;
  assignmentStatus: string | null;
  assignedRooms: string;
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

export type TodayRoomEvent = {
  reservationId: string;
  representativeName: string;
  isCheckin: boolean;
  isCheckout: boolean;
  isStay: boolean;
  nightNumber?: number;
  nightsTotal?: number;
  guestTotal: string | null;
  adultMale: string | null;
  adultFemale: string | null;
  boyStudent: string | null;
  girlStudent: string | null;
  age3plus: string | null;
  under3: string | null;
  bbq: string | null;
  somen: string | null;
  channel: string | null;
};

export type TodayRoomBoardItem = {
  roomId: string;
  roomName: string;
  events: TodayRoomEvent[];
};

export type DashboardSummary = {
  date: string;
  dateLabel: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  todayCheckinCount: number;
  todayCheckoutCount: number;
  stayingCount: number;
  requestCount: number;
  provisionalCount: number;
  confirmedCount: number;
  companionPendingCount: number;
  reservationMailPendingCount: number;
  unassignedCount: number;
  todayCheckins: DashboardListItem[];
  todayCheckouts: DashboardListItem[];
  staying: DashboardListItem[];
  todayRooms: TodayRoomBoardItem[];
};

function toListItem(
  r: DbReservation,
  assignmentsByReservation: Map<string, DbAssignment[]>,
  refDate: Date
): DashboardListItem {
  const assignments = assignmentsByReservation.get(r.reservation_id) ?? [];
  const assignedRooms =
    assignments
      .map((a) => a.room_name)
      .filter(Boolean)
      .join(" / ") || "";
  const guestRequired = effectiveGuestCountForCompanion(r) >= 2;

  return {
    reservationId: r.reservation_id,
    representativeName: r.representative_name,
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
    meal: r.meal,
    bbq: r.bbq,
    somen: r.somen,
    inquiry: r.inquiry,
    internalMemo: r.internal_memo,
    guestMemo: r.guest_memo,
    arrivalTime: r.arrival_time,
    vehicleCount: r.vehicle_count,
    assignmentStatus: r.assignment_status,
    assignedRooms,
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
  };
}

function occNightFields(
  r: DbReservation,
  dayMs: number,
  iso: string
): { nightNumber?: number; nightsTotal?: number } {
  const ci = parseReservationDate(r.check_in);
  if (!ci) return {};
  const checkOutIso = String(r.check_out ?? "").slice(0, 10);
  if (iso && checkOutIso && iso === checkOutIso) return {};
  const ciMs = stripTime(ci).getTime();
  let nightNumber = Math.max(1, Math.round((dayMs - ciMs) / 86400000) + 1);
  const total =
    r.nights ||
    (r.check_in && r.check_out
      ? daysBetweenCalendarDates(
          parseReservationDate(r.check_in)!,
          parseReservationDate(r.check_out)!
        )
      : 0);
  if (total > 0) nightNumber = Math.min(nightNumber, total);
  return {
    nightNumber,
    nightsTotal: total > 0 ? total : nightNumber,
  };
}

function buildTodayRoomsBoard(
  rooms: DbRoom[],
  assignments: DbAssignment[],
  reservationsById: Map<string, DbReservation>,
  iso: string,
  dayMs: number
): TodayRoomBoardItem[] {
  const assignmentsByRoom = new Map<string, DbAssignment[]>();
  for (const a of assignments) {
    if (!a.room_id) continue;
    const list = assignmentsByRoom.get(a.room_id) ?? [];
    list.push(a);
    assignmentsByRoom.set(a.room_id, list);
  }

  return rooms.map((room) => {
    const events: TodayRoomEvent[] = [];
    for (const a of assignmentsByRoom.get(room.room_id) ?? []) {
      const res = reservationsById.get(a.reservation_id);
      if (res && (res.status === "キャンセル" || res.status === "不可")) continue;

      const bounds = occupancyStayBounds(a, res);
      const start = parseReservationDate(bounds.start);
      const end = parseReservationDate(bounds.end);
      if (!start || !end) continue;

      const startMs = stripTime(start).getTime();
      const endMs = stripTime(end).getTime();
      const isStay = startMs <= dayMs && dayMs < endMs;
      const isCheckin = bounds.start === iso;
      const isCheckout = bounds.end === iso;
      if (!isStay && !isCheckin && !isCheckout) continue;

      const night = res ? occNightFields(res, dayMs, iso) : {};
      const guests = guestDisplayFieldsFromRoomAssignment(a, res);
      events.push({
        reservationId: a.reservation_id,
        representativeName: res?.representative_name ?? "—",
        isCheckin,
        isCheckout,
        isStay,
        nightNumber: night.nightNumber,
        nightsTotal: night.nightsTotal,
        guestTotal: guests.guestTotal ?? null,
        adultMale: guests.adultMale ?? null,
        adultFemale: guests.adultFemale ?? null,
        boyStudent: guests.boyStudent ?? null,
        girlStudent: guests.girlStudent ?? null,
        age3plus: guests.age3plus ?? null,
        under3: guests.under3 ?? null,
        bbq: guests.bbq ?? null,
        somen: guests.somen ?? null,
        channel: guests.channel ?? null,
      });
    }

    return {
      roomId: room.room_id,
      roomName: room.room_name,
      events: sortByCheckoutThenCheckin(events),
    };
  });
}

export async function getDashboardSummary(): Promise<{
  dashboard: DashboardSummary | null;
  error: string | null;
}> {
  return unstable_cache(
    getDashboardSummaryUncached,
    ["dashboard-summary"],
    { tags: [CACHE_TAGS.dashboard], revalidate: 60 }
  )();
}

async function getDashboardSummaryUncached(): Promise<{
  dashboard: DashboardSummary | null;
  error: string | null;
}> {
  const supabase = await createReadClient();
  const iso = todayIso();
  const refDate = businessToday();
  const dayMs = refDate.getTime();
  const todayOrClause = `check_in.eq.${iso},check_out.eq.${iso},and(check_in.lt.${iso},check_out.gt.${iso})`;

  const TASK_COUNTER_SELECT =
    "reservation_id, status, check_out, is_archived, assignment_status, completion_email_sent, day11_email_sent, day3_email_sent, companion_form_answered, email, check_in, created_at, sheet_created_at, guest_total, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3";

  const [
    { data: todayReservations, error: resError },
    { data: counterRows, error: counterError },
    { data: allActiveAssignments, error: allAssignError },
    { data: rooms, error: roomsError },
    { count: requestCountRaw, error: reqError },
    { data: syncRuns },
  ] = await Promise.all([
    supabase
      .from("reservations")
      .select(
        "reservation_id, representative_name, status, check_in, check_out, nights, guest_total, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3, arrival_time, meal, bbq, somen, channel, inquiry, internal_memo, guest_memo, vehicle_count, assignment_status, companion_form_answered, email, completion_email_sent, day11_email_sent, day3_email_sent, created_at, sheet_created_at, updated_at, is_archived"
      )
      .eq("is_archived", false)
      .or(todayOrClause),
    // これから（一覧デフォルトと同じ）— ステータス／TODO件数の母集団
    supabase
      .from("reservations")
      .select(TASK_COUNTER_SELECT)
      .eq("is_archived", false)
      .gte("check_out", iso),
    // 部屋未割当は一覧と同じ実割当判定のため、アクティブ割当を全件取る
    supabase
      .from("room_assignments")
      .select(
        "reservation_id, assigned_guest_count, male_count, female_count, boy_student_count, girl_student_count, age_3plus_count, under_3_count"
      )
      .eq("is_archived", false),
    supabase
      .from("rooms")
      .select("room_id, room_name, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    // リクエスト一覧デフォルト（これから）と揃える
    supabase
      .from("reservation_requests")
      .select("request_id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("status", "リクエスト")
      .gte("check_out", iso),
    supabase
      .from("sync_runs")
      .select("status, started_at")
      .order("started_at", { ascending: false })
      .limit(1),
  ]);

  if (resError) return { dashboard: null, error: jwtSessionErrorMessage(resError.message) };
  if (counterError) return { dashboard: null, error: jwtSessionErrorMessage(counterError.message) };
  if (allAssignError) return { dashboard: null, error: jwtSessionErrorMessage(allAssignError.message) };
  if (roomsError) return { dashboard: null, error: jwtSessionErrorMessage(roomsError.message) };
  if (reqError) return { dashboard: null, error: jwtSessionErrorMessage(reqError.message) };

  const all = (todayReservations ?? []) as DbReservation[];
  const { data: assignments, error: assignError } =
    await fetchAssignmentsForReservationIds<DbAssignment>(
      supabase,
      all.map((r) => r.reservation_id),
      "room_assignment_id, reservation_id, room_id, room_name, stay_start, stay_end, assigned_guest_count, male_count, female_count, boy_student_count, girl_student_count, age_3plus_count, under_3_count, is_archived",
      false
    );
  if (assignError) return { dashboard: null, error: jwtSessionErrorMessage(assignError) };

  const taskRows = (counterRows ?? []) as DbReservation[];
  const dayAssignments = assignments;
  const assignmentsByReservation = new Map<string, DbAssignment[]>();
  for (const a of dayAssignments) {
    const list = assignmentsByReservation.get(a.reservation_id) ?? [];
    list.push(a);
    assignmentsByReservation.set(a.reservation_id, list);
  }
  const reservationsById = new Map(all.map((r) => [r.reservation_id, r]));

  const byArrivalThenName = (
    a: DashboardListItem,
    b: DashboardListItem
  ) => {
    const at = a.arrivalTime?.trim() ?? "";
    const bt = b.arrivalTime?.trim() ?? "";
    if (at !== bt) {
      if (!at) return 1;
      if (!bt) return -1;
      return at < bt ? -1 : 1;
    }
    return (a.representativeName ?? "").localeCompare(
      b.representativeName ?? "",
      "ja"
    );
  };

  const todayCheckins = all
    .filter((r) => {
      const ci = parseReservationDate(r.check_in);
      return (
        ci &&
        isSameDay(ci, refDate) &&
        ACTIVE_STATUSES.includes(r.status)
      );
    })
    .map((r) => toListItem(r, assignmentsByReservation, refDate))
    .sort(byArrivalThenName);

  const todayCheckouts = all
    .filter((r) => {
      const co = parseReservationDate(r.check_out);
      return (
        co &&
        isSameDay(co, refDate) &&
        ACTIVE_STATUSES.includes(r.status)
      );
    })
    .map((r) => toListItem(r, assignmentsByReservation, refDate))
    .sort(byArrivalThenName);

  const staying = all
    .filter((r) => {
      const ci = parseReservationDate(r.check_in);
      const co = parseReservationDate(r.check_out);
      if (!ci || !co) return false;
      if (ci.getTime() >= dayMs || co.getTime() <= dayMs) return false;
      return STAYING_STATUSES.includes(r.status);
    })
    .map((r) => {
      const item = toListItem(r, assignmentsByReservation, refDate);
      const ci = parseReservationDate(r.check_in)!;
      item.nightNumber = Math.max(
        1,
        Math.round((dayMs - stripTime(ci).getTime()) / 86400000) + 1
      );
      return item;
    })
    .sort(byArrivalThenName);

  const requestCount = requestCountRaw ?? 0;
  const taskCountRows = taskRows as unknown as DashboardCountRow[];
  const counts = computeDashboardCounts(
    taskCountRows,
    groupAssignmentsByReservation(
      (allActiveAssignments ?? []) as DashboardAssignmentRow[]
    ),
    refDate
  );

  const todayRooms = buildTodayRoomsBoard(
    (rooms ?? []) as DbRoom[],
    dayAssignments,
    reservationsById,
    iso,
    dayMs
  );
  const latestSync = (syncRuns?.[0] ?? null) as
    | { status: string | null; started_at: string | null }
    | null;

  return {
    dashboard: {
      date: iso,
      dateLabel: formatDateLabel(refDate),
      lastSyncAt: latestSync?.started_at ?? null,
      lastSyncStatus: latestSync?.status ?? null,
      todayCheckinCount: todayCheckins.length,
      todayCheckoutCount: todayCheckouts.length,
      stayingCount: staying.length,
      requestCount,
      provisionalCount: counts.provisionalCount,
      confirmedCount: counts.confirmedCount,
      companionPendingCount: counts.companionPendingCount,
      reservationMailPendingCount: counts.reservationMailPendingCount,
      unassignedCount: counts.unassignedCount,
      todayCheckins,
      todayCheckouts,
      staying,
      todayRooms,
    },
    error: null,
  };
}
