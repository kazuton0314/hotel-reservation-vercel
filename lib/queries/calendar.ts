import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { createReadClient } from "@/lib/supabase/read";
import { stripTime } from "@/lib/import/date-utils";
import {
  buildDayCalendarView,
  buildMonthCalendarView,
  buildWeekCalendarView,
  type CalendarAssignment,
  type CalendarReservation,
  type DayCalendarView,
  type MonthCalendarView,
  type WeekCalendarView,
} from "@/lib/services/calendar";
import { parseReservationDate } from "@/lib/utils/date-label";
import { includeArchivedForDateRange } from "@/lib/utils/list-scope";
import type { TodayRoomBoardItem } from "@/lib/queries/dashboard";

function monthBounds(year: number, month: number) {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { monthStart, monthEnd };
}

function weekBounds(anchorDate: string) {
  const anchor = parseReservationDate(anchorDate) || stripTime(new Date());
  const day = anchor.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + diffToMon);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(monday), to: fmt(sunday) };
}

async function fetchCalendarData(from: string, to: string) {
  const supabase = await createReadClient();
  const withArchived = includeArchivedForDateRange(from);

  let reservationsQuery = supabase
    .from("reservations")
    .select(
      "reservation_id, representative_name, status, check_in, check_out, nights, guest_total, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3, arrival_time, meal, bbq, inquiry, assignment_status"
    )
    .lte("check_in", to)
    .gte("check_out", from);

  let assignmentsQuery = supabase
    .from("room_assignments")
    .select(
      "room_assignment_id, reservation_id, room_id, room_name, stay_start, stay_end"
    )
    .lte("stay_start", to)
    .gte("stay_end", from);

  if (!withArchived) {
    reservationsQuery = reservationsQuery.eq("is_archived", false);
    assignmentsQuery = assignmentsQuery.eq("is_archived", false);
  }

  const [
    { data: reservations, error: resError },
    { data: assignments, error: assignError },
  ] = await Promise.all([reservationsQuery, assignmentsQuery]);

  const assignmentsByReservation = new Map<string, CalendarAssignment[]>();
  for (const a of (assignments ?? []) as CalendarAssignment[]) {
    const list = assignmentsByReservation.get(a.reservation_id) ?? [];
    list.push(a);
    assignmentsByReservation.set(a.reservation_id, list);
  }

  return {
    reservations: (reservations ?? []) as CalendarReservation[],
    assignmentsByReservation,
    error: resError?.message ?? assignError?.message ?? null,
  };
}

async function fetchTodayRooms(iso: string): Promise<TodayRoomBoardItem[]> {
  const supabase = await createReadClient();
  const refDate = parseReservationDate(iso);
  if (!refDate) return [];
  const dayMs = stripTime(refDate).getTime();
  const withArchived = includeArchivedForDateRange(iso);

  let assignmentsQuery = supabase
    .from("room_assignments")
    .select(
      "room_assignment_id, reservation_id, room_id, room_name, stay_start, stay_end, assigned_guest_count, is_archived"
    )
    .lte("stay_start", iso)
    .gte("stay_end", iso);

  let reservationsQuery = supabase
    .from("reservations")
    .select(
      "reservation_id, representative_name, status, check_in, check_out, nights, guest_total, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3, arrival_time, bbq"
    )
    .lte("check_in", iso)
    .gte("check_out", iso);

  if (!withArchived) {
    assignmentsQuery = assignmentsQuery.eq("is_archived", false);
    reservationsQuery = reservationsQuery.eq("is_archived", false);
  }

  const [
    { data: rooms },
    { data: assignments },
    { data: reservations },
  ] = await Promise.all([
    supabase
      .from("rooms")
      .select("room_id, room_name, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    assignmentsQuery,
    reservationsQuery,
  ]);

  const reservationsById = new Map(
    (reservations ?? []).map((r) => [r.reservation_id, r])
  );

  return (rooms ?? []).map((room) => {
    const events: TodayRoomBoardItem["events"] = [];
    for (const a of assignments ?? []) {
      if (a.room_id !== room.room_id) continue;
      const res = reservationsById.get(a.reservation_id);
      if (res && (res.status === "キャンセル" || res.status === "不可")) continue;
      const start = parseReservationDate(a.stay_start);
      const end = parseReservationDate(a.stay_end);
      if (!start || !end) continue;
      const startMs = stripTime(start).getTime();
      const endMs = stripTime(end).getTime();
      const isStay = startMs <= dayMs && dayMs < endMs;
      const isCheckin = a.stay_start === iso;
      const isCheckout = a.stay_end === iso;
      if (!isStay && !isCheckin && !isCheckout) continue;
      events.push({
        reservationId: a.reservation_id,
        representativeName: res?.representative_name ?? "—",
        isCheckin,
        isCheckout,
        isStay,
        guestTotal: res?.guest_total ?? null,
        adultMale: res?.adult_male ?? null,
        adultFemale: res?.adult_female ?? null,
        boyStudent: res?.boy_student ?? null,
        girlStudent: res?.girl_student ?? null,
        age3plus: res?.age_3plus ?? null,
        under3: res?.under_3 ?? null,
        bbq: res?.bbq ?? null,
      });
    }
    return {
      roomId: room.room_id,
      roomName: room.room_name,
      events,
    };
  });
}

export async function getMonthCalendar(
  year: number,
  month: number
): Promise<{ data: MonthCalendarView | null; error: string | null }> {
  return unstable_cache(
    async () => {
      const { monthStart, monthEnd } = monthBounds(year, month);
      const snap = await fetchCalendarData(monthStart, monthEnd);
      if (snap.error) return { data: null, error: snap.error };
      return {
        data: buildMonthCalendarView(
          year,
          month,
          snap.reservations,
          snap.assignmentsByReservation
        ),
        error: null,
      };
    },
    ["calendar-month", String(year), String(month)],
    { tags: [CACHE_TAGS.calendar], revalidate: 60 }
  )();
}

export async function getWeekCalendar(
  anchorDate: string
): Promise<{ data: WeekCalendarView | null; error: string | null }> {
  return unstable_cache(
    async () => {
      const { from, to } = weekBounds(anchorDate);
      const snap = await fetchCalendarData(from, to);
      if (snap.error) return { data: null, error: snap.error };
      return {
        data: buildWeekCalendarView(
          anchorDate,
          snap.reservations,
          snap.assignmentsByReservation
        ),
        error: null,
      };
    },
    ["calendar-week", anchorDate],
    { tags: [CACHE_TAGS.calendar], revalidate: 60 }
  )();
}

export async function getDayCalendar(
  date: string
): Promise<{ data: DayCalendarView | null; error: string | null }> {
  return unstable_cache(
    async () => {
      const snap = await fetchCalendarData(date, date);
      if (snap.error) return { data: null, error: snap.error };
      const todayRooms = await fetchTodayRooms(date);
      return {
        data: buildDayCalendarView(
          date,
          snap.reservations,
          snap.assignmentsByReservation,
          todayRooms
        ),
        error: null,
      };
    },
    ["calendar-day", date],
    { tags: [CACHE_TAGS.calendar], revalidate: 60 }
  )();
}
