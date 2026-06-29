import { createClient } from "@/lib/supabase/server";

export type ReservationListItem = {
  reservation_id: string;
  representative_name: string | null;
  status: string;
  check_in: string | null;
  check_out: string | null;
  guest_total: string | null;
  assignment_status: string | null;
  channel: string | null;
  is_archived: boolean;
  completion_email_sent: boolean;
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
  display_memo: string | null;
  assignment_memo: string | null;
  is_archived: boolean;
};

export type ReservationFilters = {
  status?: string;
  includeArchived?: boolean;
  scope?: "upcoming" | "all";
  assignment?: "unassigned";
  mailPending?: boolean;
};

export async function getReservations(filters: ReservationFilters = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("reservations")
    .select(
      "reservation_id, representative_name, status, check_in, check_out, guest_total, assignment_status, channel, is_archived, completion_email_sent"
    )
    .order("check_in", { ascending: true, nullsFirst: false });

  if (!filters.includeArchived) {
    query = query.eq("is_archived", false);
  } else {
    query = query.eq("is_archived", true);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.assignment === "unassigned") {
    query = query.eq("assignment_status", "未割当");
  }
  if (filters.mailPending) {
    query = query.eq("completion_email_sent", false);
  }
  if (filters.scope === "upcoming") {
    const today = new Date().toISOString().slice(0, 10);
    query = query.gte("check_out", today);
  }

  const { data, error } = await query;
  return {
    reservations: (data ?? []) as ReservationListItem[],
    error: error?.message ?? null,
  };
}

export async function getReservationById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("reservation_id", id)
    .maybeSingle();

  return { reservation: data, error: error?.message ?? null };
}

export async function getRoomAssignmentsByReservationId(reservationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("room_assignments")
    .select(
      "room_assignment_id, room_name, room_id, stay_start, stay_end, assigned_guest_count, male_count, female_count, child_count, display_memo, assignment_memo, is_archived"
    )
    .eq("reservation_id", reservationId)
    .order("stay_start", { ascending: true });

  return {
    assignments: (data ?? []) as RoomAssignmentItem[],
    error: error?.message ?? null,
  };
}

export async function getReservationStats() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  return { runs: data ?? [], error: error?.message ?? null };
}

export async function getFormImportCounts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_import_log")
    .select("source");

  if (error) return { studio: 0, request: 0, error: error.message };

  const studio = (data ?? []).filter((r) => r.source === "studio").length;
  const request = (data ?? []).filter((r) => r.source === "request").length;
  return { studio, request, error: null };
}
