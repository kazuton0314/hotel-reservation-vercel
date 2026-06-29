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
};

export type ReservationFilters = {
  status?: string;
  includeArchived?: boolean;
  scope?: "upcoming" | "all";
};

export async function getReservations(filters: ReservationFilters = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("reservations")
    .select(
      "reservation_id, representative_name, status, check_in, check_out, guest_total, assignment_status, channel, is_archived"
    )
    .order("check_in", { ascending: true, nullsFirst: false });

  if (!filters.includeArchived) {
    query = query.eq("is_archived", false);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
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

export async function getReservationStats() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [active, upcoming, unassigned] = await Promise.all([
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
  ]);

  return {
    activeCount: active.count ?? 0,
    upcomingCount: upcoming.count ?? 0,
    unassignedCount: unassigned.count ?? 0,
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
