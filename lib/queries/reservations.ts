import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { createReadClient } from "@/lib/supabase/read";
import {
  reservationHasActiveCompanionTask,
  reservationHasActiveConfirmationTask,
} from "@/lib/services/reservation-active-tasks";
import { reservationNeedsCompanionInfo } from "@/lib/services/mail-pending";
import {
  applyReservationListOrder,
  isSqlEqReservationFilterField,
  needsInMemoryReservationListProcessing,
  reservationIdsForRoomFilter,
} from "@/lib/services/reservation-list-query";
import { isRoomAssignmentComplete } from "@/lib/services/assignment-status";
import {
  UNASSIGNED_ROOM_FILTER,
  applyReservationListFilter,
  sqlValuesForReservationFilter,
} from "@/lib/services/reservation-list-filter";
import { DEFAULTS } from "@/lib/config/forms";
import { effectiveGuestCountForCompanion } from "@/lib/utils/guest-display";
import { idPrefixIlikePattern, isIdLikeQuery } from "@/lib/utils/id-search";
import { todayIso } from "@/lib/utils/date-label";
import { escapeIlike } from "@/lib/utils/sql-ilike";
import {
  DEFAULT_LIST_PAGE_SIZE,
  clampPage,
  isRangeNotSatisfiableError,
  pageRange,
  paginateItems,
  parsePageParam,
} from "@/lib/utils/list-pagination";
import { filterListBySearch } from "@/lib/utils/list-search";
import { parseListSort, sortListItems } from "@/lib/utils/list-sort";

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
  referral: string | null;
  travel_purpose: string | null;
  internal_memo: string | null;
  guest_memo: string | null;
  inquiry: string | null;
  arrival_time: string | null;
  vehicle_count: string | null;
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
  assignments: {
    room_assignment_id: string;
    room_id: string | null;
    room_name: string | null;
    stay_start: string;
    stay_end: string;
    updated_at: string | null;
    assigned_guest_count: number | null;
    male_count: number | null;
    female_count: number | null;
    boy_student_count: number | null;
    girl_student_count: number | null;
    age_3plus_count: number | null;
    under_3_count: number | null;
  }[];
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
  updated_at: string | null;
};

export type ReservationListQuery = {
  q?: string;
  checkIn?: string;
  filterField?: string;
  filterValue?: string;
  sort?: string;
  dir?: string;
  page?: number;
  pageSize?: number;
};

export type ReservationFilters = {
  period?: "provisional" | "confirmed" | "cancelled";
  status?: string;
  scope?: "upcoming" | "archive" | "past";
  assignment?: "unassigned";
  mailPending?: boolean;
  companionPending?: boolean;
  /** 一覧ページ用。指定時は検索・絞込・並び・ページをサーバー側で適用 */
  list?: ReservationListQuery;
};

type AssignmentListRow = {
  room_assignment_id: string;
  room_id: string | null;
  room_name: string | null;
  stay_start: string;
  stay_end: string;
  updated_at: string | null;
  assigned_guest_count: number | null;
  male_count: number | null;
  female_count: number | null;
  boy_student_count: number | null;
  girl_student_count: number | null;
  age_3plus_count: number | null;
  under_3_count: number | null;
};

const LIST_SELECT =
  "reservation_id, representative_name, last_name, first_name, name_kana, last_name_kana, first_name_kana, group_name, phone, status, check_in, check_out, guest_total, assignment_status, channel, meal, bbq, payment_status, referral, travel_purpose, internal_memo, guest_memo, inquiry, arrival_time, vehicle_count, is_archived, completion_email_sent, day11_email_sent, day3_email_sent, companion_form_answered, email, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3, created_at, sheet_created_at, updated_at";

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
  referral: string | null;
  travel_purpose: string | null;
  internal_memo: string | null;
  guest_memo: string | null;
  inquiry: string | null;
  arrival_time: string | null;
  vehicle_count: string | null;
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
  assignmentsByReservation: Map<string, AssignmentListRow[]>,
  refDate: Date,
  options?: { deriveAssignmentStatus?: boolean }
): ReservationListItem {
  const assignments = assignmentsByReservation.get(row.reservation_id) ?? [];
  const assignedRooms = assignments
    .map((a) => a.room_name || a.room_id)
    .filter(Boolean)
    .join(" / ");
  const guestRequired = effectiveGuestCountForCompanion(row) > 1;
  const companionPending = reservationNeedsCompanionInfo(row, refDate);
  const receivedSource = row.sheet_created_at || row.created_at;
  // 一覧に載せる割当はスコープに応じた行だけ。表示・未割当判定をキャッシュ列と揃える
  const assignment_status = options?.deriveAssignmentStatus
    ? isRoomAssignmentComplete(row.guest_total, assignments)
      ? "割当済"
      : DEFAULTS.assignmentStatus
    : row.assignment_status;
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
    assignment_status,
    channel: row.channel,
    meal: row.meal,
    bbq: row.bbq,
    payment_status: row.payment_status,
    referral: row.referral,
    travel_purpose: row.travel_purpose,
    internal_memo: row.internal_memo,
    guest_memo: row.guest_memo,
    inquiry: row.inquiry,
    arrival_time: row.arrival_time,
    vehicle_count: row.vehicle_count,
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
    any_mail_pending: reservationHasActiveConfirmationTask(row, refDate),
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

async function loadAssignmentsByReservationIds(
  supabase: Awaited<ReturnType<typeof createReadClient>>,
  ids: string[],
  includeArchivedAssignments: boolean
) {
  const assignmentsByReservation = new Map<string, AssignmentListRow[]>();
  if (!ids.length) return assignmentsByReservation;

  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    for (const id of chunk) {
      assignmentsByReservation.set(id, []);
    }
    let assignQuery = supabase
      .from("room_assignments")
      .select(
        "room_assignment_id, reservation_id, room_id, room_name, stay_start, stay_end, updated_at, assigned_guest_count, male_count, female_count, boy_student_count, girl_student_count, age_3plus_count, under_3_count"
      )
      .in("reservation_id", chunk);
    if (!includeArchivedAssignments) {
      assignQuery = assignQuery.eq("is_archived", false);
    }
    const { data: assignments } = await assignQuery;
    for (const a of assignments ?? []) {
      const list = assignmentsByReservation.get(a.reservation_id) ?? [];
      list.push({
        room_assignment_id: a.room_assignment_id,
        room_id: a.room_id,
        room_name: a.room_name,
        stay_start: a.stay_start,
        stay_end: a.stay_end,
        updated_at: a.updated_at,
        assigned_guest_count: a.assigned_guest_count,
        male_count: a.male_count,
        female_count: a.female_count,
        boy_student_count: a.boy_student_count,
        girl_student_count: a.girl_student_count,
        age_3plus_count: a.age_3plus_count,
        under_3_count: a.under_3_count,
      });
      assignmentsByReservation.set(a.reservation_id, list);
    }
  }
  return assignmentsByReservation;
}

function buildReservationBaseQuery(
  supabase: Awaited<ReturnType<typeof createReadClient>>,
  filters: ReservationFilters,
  list?: ReservationListQuery,
  roomReservationIds?: string[] | null
) {
  const today = todayIso();
  let query = supabase.from("reservations").select(LIST_SELECT, { count: "exact" });

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
    query = query.eq("assignment_status", "未割当").eq("status", "確定");
  }

  const checkIn = String(list?.checkIn ?? "").trim();
  if (checkIn) {
    query = query.eq("check_in", checkIn);
  }

  const keyword = String(list?.q ?? "").trim();
  if (keyword) {
    if (isIdLikeQuery(keyword)) {
      query = query.ilike("reservation_id", `${idPrefixIlikePattern(keyword)}%`);
    } else {
      const q = escapeIlike(keyword);
      query = query.or(
        [
          `representative_name.ilike.%${q}%`,
          `name_kana.ilike.%${q}%`,
          `last_name.ilike.%${q}%`,
          `first_name.ilike.%${q}%`,
          `last_name_kana.ilike.%${q}%`,
          `first_name_kana.ilike.%${q}%`,
          `group_name.ilike.%${q}%`,
          `email.ilike.%${q}%`,
          `phone.ilike.%${q}%`,
        ].join(",")
      );
    }
  }

  if (list?.filterField === "roomId" && list.filterValue) {
    // 未割当は assignment_status キャッシュが古いことがあるため SQL では扱わず
    // needsInMemoryReservationListProcessing 経由の実割当判定に任せる
    if (list.filterValue === UNASSIGNED_ROOM_FILTER) {
      // no-op on SQL path
    } else if (roomReservationIds?.length) {
      query = query.in("reservation_id", roomReservationIds);
    } else {
      query = query.eq("reservation_id", "__none__");
    }
  } else if (
    list?.filterField &&
    list.filterValue &&
    isSqlEqReservationFilterField(list.filterField)
  ) {
    const values = sqlValuesForReservationFilter(
      list.filterField,
      list.filterValue
    );
    if (values.length === 1) {
      query = query.eq(list.filterField, values[0]!);
    } else if (values.length > 1) {
      query = query.in(list.filterField, values);
    }
  }

  return query;
}

async function getReservationsUncached(filters: ReservationFilters = {}) {
  const supabase = await createReadClient();
  const today = todayIso();
  const refDate = new Date();
  const includeArchivedAssignments =
    filters.scope === "archive" || filters.scope === "past";
  const list = filters.list;
  const paged = Boolean(list);
  const useSqlPagination =
    paged && !needsInMemoryReservationListProcessing(filters, list);

  if (useSqlPagination && list) {
    const sort = parseListSort(list.sort, list.dir);
    const requestedPage = list.page ?? parsePageParam(undefined);
    const pageSize = list.pageSize ?? DEFAULT_LIST_PAGE_SIZE;

    let roomReservationIds: string[] | null = null;
    if (
      list.filterField === "roomId" &&
      list.filterValue &&
      list.filterValue !== UNASSIGNED_ROOM_FILTER
    ) {
      roomReservationIds = await reservationIdsForRoomFilter(
        supabase,
        list.filterValue,
        includeArchivedAssignments
      );
    }

    let page = requestedPage;
    let data: DbListRow[] | null = null;
    let error: { message: string; code?: string; details?: string } | null =
      null;
    let count: number | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const { from, to } = pageRange(page, pageSize);
      let query = buildReservationBaseQuery(
        supabase,
        filters,
        list,
        roomReservationIds
      );
      query = applyReservationListOrder(query, sort);
      const result = await query.range(from, to);
      data = (result.data ?? null) as DbListRow[] | null;
      error = result.error;
      count = result.count;

      if (!error) {
        if (
          count != null &&
          count > 0 &&
          from >= count &&
          page > 1
        ) {
          page = clampPage(page, count, pageSize);
          continue;
        }
        break;
      }

      if (isRangeNotSatisfiableError(error) && page > 1) {
        page = 1;
        continue;
      }
      break;
    }

    if (error) {
      return {
        reservations: [] as ReservationListItem[],
        total: 0,
        error: error.message,
      };
    }

    const rows = data ?? [];
    const pageIds = rows.map((r) => r.reservation_id);
    const assignmentsByReservation = await loadAssignmentsByReservationIds(
      supabase,
      pageIds,
      includeArchivedAssignments
    );
    const reservations = rows.map((row) =>
      mapReservationListItem(row, assignmentsByReservation, refDate, {
        deriveAssignmentStatus: true,
      })
    );

    return {
      reservations,
      total: count ?? reservations.length,
      error: null,
    };
  }

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
    query = query.eq("assignment_status", "未割当").eq("status", "確定");
  }

  const { data, error } = await query;
  if (error) {
    return {
      reservations: [] as ReservationListItem[],
      total: 0,
      error: error.message,
    };
  }

  let rows = (data ?? []) as DbListRow[];

  if (filters.mailPending) {
    rows = rows.filter((row) =>
      reservationHasActiveConfirmationTask(row, refDate)
    );
  }
  if (filters.companionPending) {
    rows = rows.filter((row) =>
      reservationHasActiveCompanionTask(row, refDate)
    );
  }

  const needsAllAssignments =
    !paged ||
    (list?.filterField === "roomId" && Boolean(list.filterValue));

  let assignmentsByReservation = new Map<string, AssignmentListRow[]>();
  if (needsAllAssignments) {
    assignmentsByReservation = await loadAssignmentsByReservationIds(
      supabase,
      rows.map((r) => r.reservation_id),
      includeArchivedAssignments
    );
  }

  const reservations = rows.map((row) =>
    mapReservationListItem(row, assignmentsByReservation, refDate, {
      deriveAssignmentStatus: needsAllAssignments,
    })
  );

  if (!paged) {
    return { reservations, total: reservations.length, error: null };
  }

  const filtered = applyReservationListFilter(
    reservations,
    list?.filterField,
    list?.filterValue
  );
  const searched = filterListBySearch(
    filtered.map((item) => ({ ...item, id: item.reservation_id })),
    list?.q,
    list?.checkIn
  );
  const sort = parseListSort(list?.sort, list?.dir);
  const sorted = sortListItems(searched, sort);
  const page = list?.page ?? parsePageParam(undefined);
  const pageSize = list?.pageSize ?? DEFAULT_LIST_PAGE_SIZE;
  const pagedResult = paginateItems(sorted, page, pageSize);

  if (!needsAllAssignments) {
    const pageIds = pagedResult.items.map((r) => r.reservation_id);
    const pageAssignments = await loadAssignmentsByReservationIds(
      supabase,
      pageIds,
      includeArchivedAssignments
    );
    const rowById = new Map(rows.map((r) => [r.reservation_id, r]));
    const hydrated = pagedResult.items.map((item) => {
      const row = rowById.get(item.reservation_id);
      if (!row) return item;
      return mapReservationListItem(row, pageAssignments, refDate, {
        deriveAssignmentStatus: true,
      });
    });
    return {
      reservations: hydrated,
      total: pagedResult.total,
      error: null,
    };
  }

  return {
    reservations: pagedResult.items,
    total: pagedResult.total,
    error: null,
  };
}

export async function getReservationById(id: string) {
  return unstable_cache(
    async () => {
      const supabase = await createReadClient();
      const { data, error } = await supabase
        .from("reservations")
        .select("*")
        .eq("reservation_id", id)
        .maybeSingle();

      return { reservation: data, error: error?.message ?? null };
    },
    ["reservation-by-id", id],
    {
      tags: [CACHE_TAGS.reservation(id), CACHE_TAGS.reservations],
      revalidate: 60,
    }
  )();
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
      "room_assignment_id, room_name, room_id, stay_start, stay_end, assigned_guest_count, male_count, female_count, child_count, boy_student_count, girl_student_count, age_3plus_count, under_3_count, display_memo, assignment_memo, is_archived, updated_at"
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
  const [studioRes, requestRes] = await Promise.all([
    supabase
      .from("form_import_log")
      .select("id", { count: "exact", head: true })
      .eq("source", "studio"),
    supabase
      .from("form_import_log")
      .select("id", { count: "exact", head: true })
      .eq("source", "request"),
  ]);

  if (studioRes.error || requestRes.error) {
    return {
      studio: 0,
      request: 0,
      error: studioRes.error?.message || requestRes.error?.message || null,
    };
  }

  return {
    studio: studioRes.count ?? 0,
    request: requestRes.count ?? 0,
    error: null,
  };
}
