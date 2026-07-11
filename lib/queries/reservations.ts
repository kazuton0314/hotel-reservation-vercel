import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { createReadClient } from "@/lib/supabase/read";
import {
  reservationHasAnyMailPending,
  reservationNeedsCompanionInfo,
} from "@/lib/services/mail-pending";
import { effectiveGuestCountForCompanion } from "@/lib/utils/guest-display";
import { idPrefixIlikePattern, isIdLikeQuery } from "@/lib/utils/id-search";
import { todayIso } from "@/lib/utils/date-label";

export type ReservationListItem = {
  reservation_id: string;
  representative_name: string | null;
  last_name?: string | null;
  first_name?: string | null;
  name_kana?: string | null;
  last_name_kana?: string | null;
  first_name_kana?: string | null;
  group_name?: string | null;
  phone?: string | null;
  status: string;
  check_in: string | null;
  check_out: string | null;
  guest_total: string | null;
  assignment_status: string | null;
  channel: string | null;
  meal: string | null;
  bbq: string | null;
  payment_status: string | null;
  is_archived: boolean;
  completion_email_sent: boolean;
  day11_email_sent: boolean;
  day3_email_sent: boolean;
  companion_form_answered: boolean;
  email: string | null;
  adult_male: string | null;
  adult_female: string | null;
  boy_student: string | null;
  girl_student: string | null;
  age_3plus: string | null;
  under_3: string | null;
  created_at: string | null;
  sheet_created_at: string | null;
  received_ms: number;
  updated_ms: number;
  updated_at: string | null;
  assigned_rooms: string;
  assignments: { room_id: string | null; room_name: string | null }[];
  companion_pending: boolean;
  companion_required: boolean;
  any_mail_pending: boolean;
};
export type RoomAssignmentItem = {
  room_assignment_id: string;
  room_name: string | null;
  room_id: string | null;
  stay_start: string;
  stay_end: string;
  assigned_guest_count: number | null;
  male_count: number | null;
  female_count: number | null;
  child_count: number | null;
  boy_student_count: number | null;
  girl_student_count: number | null;
  age_3plus_count: number | null;
  under_3_count: number | null;
  display_memo: string | null;
  assignment_memo: string | null;
  is_archived: boolean;
};

export type ReservationFilters = {
  period?: "provisional" | "confirmed" | "cancelled";
  status?: string;
  scope?: "upcoming" | "archive" | "past";
  assignment?: "unassigned";
  mailPending?: boolean;
  companionPending?: boolean;
};

const LIST_SELECT =
  "reservation_id, representative_name, last_name, first_name, name_kana, last_name_kana, first_name_kana, group_name, phone, status, check_in, check_out, guest_total, assignment_status, channel, meal, bbq, payment_status, is_archived, completion_email_sent, day11_email_sent, day3_email_sent, companion_form_answered, email, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3, created_at, sheet_created_at, updated_at";

type DbListRow = {
  reservation_id: string;
  representative_name: string | null;
  last_name: string | null;
  first_name: string | null;
  name_kana: string | null;
  last_name_kana: string | null;
  first_name_kana: string | null;
  group_name: string | null;
  phone: string | null;
  status: string;
  check_in: string | null;
  check_out: string | null;
  guest_total: string | null;
  assignment_status: string | null;
  channel: string | null;
  meal: string | null;
  bbq: string | null;
  payment_status: string | null;
  is_archived: boolean;
  completion_email_sent: boolean;
  day11_email_sent: boolean;
  day3_email_sent: boolean;
  companion_form_answered: boolean;
  email: string | null;
  adult_male: string | null;
  adult_female: string | null;
  boy_student: string | null;
  girl_student: string | null;
  age_3plus: string | null;
  under_3: string | null;
  created_at: string | null;
  sheet_created_at: string | null;
  updated_at: string | null;
};

function periodToStatus(period?: ReservationFilters["period"]): string | undefined {
  if (period === "provisional") return "仮予約";
  if (period === "confirmed") return "確定";
  if (period === "cancelled") return "キャンセル";
  return undefined;
}

function mapReservationListItem(
  row: DbListRow,
  assignmentsByReservation: Map<
    string,
    { room_id: string | null; room_name: string | null }[]
  >,
  refDate: Date
): ReservationListItem {
  const assignments = assignmentsByReservation.get(row.reservation_id) ?? [];
  const assignedRooms = assignments
    .map((a) => a.room_name || a.room_id)
    .filter(Boolean)
    .join(" / ");
  const guestRequired = effectiveGuestCountForCompanion(row) > 1;
  const companionPending = reservationNeedsCompanionInfo(row, refDate);
  const receivedSource = row.sheet_created_at || row.created_at;
  return {
    reservation_id: row.reservation_id,
    representative_name: row.representative_name,
    last_name: row.last_name,
    first_name: row.first_name,
    name_kana: row.name_kana,
    last_name_kana: row.last_name_kana,
    first_name_kana: row.first_name_kana,
    group_name: row.group_name,
    phone: row.phone,
    status: row.status,
    check_in: row.check_in,
    check_out: row.check_out,
    guest_total: row.guest_total,
    assignment_status: row.assignment_status,
    channel: row.channel,
    meal: row.meal,
    bbq: row.bbq,
    payment_status: row.payment_status,
    is_archived: row.is_archived,
    completion_email_sent: row.completion_email_sent,
    day11_email_sent: row.day11_email_sent,
    day3_email_sent: row.day3_email_sent,
    companion_form_answered: row.companion_form_answered,
    email: row.email,
    adult_male: row.adult_male,
    adult_female: row.adult_female,
    boy_student: row.boy_student,
    girl_student: row.girl_student,
    age_3plus: row.age_3plus,
    under_3: row.under_3,
    created_at: row.created_at,
    sheet_created_at: row.sheet_created_at,
    received_ms: receivedSource ? new Date(receivedSource).getTime() : 0,
    updated_ms: row.updated_at ? new Date(row.updated_at).getTime() : 0,
    updated_at: row.updated_at,
    assigned_rooms: assignedRooms,
    assignments,
    companion_pending: companionPending,
    companion_required: guestRequired,
    any_mail_pending: reservationHasAnyMailPending(row, refDate),
  };
}

export async function getReservations(filters: ReservationFilters = {}) {
  const key = JSON.stringify(filters);
  return unstable_cache(
    () => getReservationsUncached(filters),
    ["reservations", key],
    { tags: [CACHE_TAGS.reservations], revalidate: 120 }
  )();
}

async function getReservationsUncached(filters: ReservationFilters = {}) {
  const supabase = await createReadClient();
  const today = todayIso();
  const refDate = new Date();

  let query = supabase
    .from("reservations")
    .select(LIST_SELECT)
    .order("check_in", { ascending: true, nullsFirst: false });

  if (filters.scope === "archive" || filters.scope === "past") {
    query = query.or(`is_archived.eq.true,check_out.lt.${today}`);
  } else {
    query = query.eq("is_archived", false).gte("check_out", today);
  }

  const statusFilter = filters.period
    ? periodToStatus(filters.period)
    : filters.status;
  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  if (filters.assignment === "unassigned") {
    query = query.eq("assignment_status", "未割当");
  }

  const { data, error } = await query;
  if (error) {
    return { reservations: [] as ReservationListItem[], error: error.message };
  }

  let rows = (data ?? []) as DbListRow[];

  if (filters.mailPending) {
    rows = rows.filter((row) => reservationHasAnyMailPending(row, refDate));
  }
  if (filters.companionPending) {
    rows = rows.filter((row) => reservationNeedsCompanionInfo(row, refDate));
  }

  const ids = rows.map((r) => r.reservation_id);
  const assignmentsByReservation = new Map<
    string,
    { room_id: string | null; room_name: string | null }[]
  >();

  if (ids.length) {
    const { data: assignments } = await supabase
      .from("room_assignments")
      .select("reservation_id, room_id, room_name")
      .eq("is_archived", false)
      .in("reservation_id", ids);

    for (const a of assignments ?? []) {
      const list = assignmentsByReservation.get(a.reservation_id) ?? [];
      list.push({ room_id: a.room_id, room_name: a.room_name });
      assignmentsByReservation.set(a.reservation_id, list);
    }
  }

  const reservations = rows.map((row) =>
    mapReservationListItem(row, assignmentsByReservation, refDate)
  );

  return { reservations, error: null };
}

export async function getReservationById(id: string) {
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("reservation_id", id)
    .maybeSingle();

  return { reservation: data, error: error?.message ?? null };
}

export async function getReservationsForLinking(query?: string) {
  const supabase = await createReadClient();
  let dbQuery = supabase
    .from("reservations")
    .select(
      "reservation_id, representative_name, status, check_in, check_out, guest_total"
    )
    .eq("is_archived", false)
    .neq("status", "キャンセル")
    .order("check_in", { ascending: false })
    .limit(80);

  if (query?.trim()) {
    const raw = query.trim();
    const escaped = raw.replace(/[%_]/g, "");
    if (isIdLikeQuery(raw)) {
      dbQuery = dbQuery.ilike(
        "reservation_id",
        `${idPrefixIlikePattern(raw)}%`
      );
    } else {
      dbQuery = dbQuery.or(
        `reservation_id.ilike.%${escaped}%,representative_name.ilike.%${escaped}%`
      );
    }
  }

  const { data, error } = await dbQuery;
  return {
    reservations: data ?? [],
    error: error?.message ?? null,
  };
}

export async function getRoomAssignmentsByReservationId(reservationId: string) {
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("room_assignments")
    .select(
      "room_assignment_id, room_name, room_id, stay_start, stay_end, assigned_guest_count, male_count, female_count, child_count, boy_student_count, girl_student_count, age_3plus_count, under_3_count, display_memo, assignment_memo, is_archived"
    )
    .eq("reservation_id", reservationId)
    .order("stay_start", { ascending: true });

  return {
    assignments: (data ?? []) as RoomAssignmentItem[],
    error: error?.message ?? null,
  };
}

export async function getReservationStats() {
  const supabase = await createReadClient();
  const today = todayIso();

  const [active, upcoming, unassigned, requestsPending, mailPending] =
    await Promise.all([
    supabase
      .from("reservations")
      .select("reservation_id", { count: "exact", head: true })
      .eq("is_archived", false),
    supabase
      .from("reservations")
      .select("reservation_id", { count: "exact", head: true })
      .eq("is_archived", false)
      .gte("check_out", today)
      .in("status", ["仮予約", "確定"]),
    supabase
      .from("reservations")
      .select("reservation_id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("assignment_status", "未割当")
      .in("status", ["仮予約", "確定"]),
    supabase
      .from("reservation_requests")
      .select("request_id", { count: "exact", head: true })
      .eq("is_archived", false)
      .in("status", ["リクエスト", "承認済"]),
    supabase
      .from("reservations")
      .select("reservation_id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("completion_email_sent", false)
      .in("status", ["仮予約", "確定"]),
  ]);

  return {
    activeCount: active.count ?? 0,
    upcomingCount: upcoming.count ?? 0,
    unassignedCount: unassigned.count ?? 0,
    requestPendingCount: requestsPending.count ?? 0,
    mailPendingCount: mailPending.count ?? 0,
  };
}

export async function getRecentSyncRuns(limit = 10) {
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  return { runs: data ?? [], error: error?.message ?? null };
}

export async function getFormImportCounts() {
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("form_import_log")
    .select("source");

  if (error) return { studio: 0, request: 0, error: error.message };

  const studio = (data ?? []).filter((r) => r.source === "studio").length;
  const request = (data ?? []).filter((r) => r.source === "request").length;
  return { studio, request, error: null };
}
