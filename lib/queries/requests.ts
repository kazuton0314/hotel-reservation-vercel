import { createClient } from "@/lib/supabase/server";

export type RequestListItem = {
  request_id: string;
  status: string;
  representative_name: string | null;
  check_in: string | null;
  check_out: string | null;
  guest_total: string | null;
  email: string | null;
  linked_reservation_id: string | null;
  is_archived: boolean;
  updated_at: string;
};

export type RequestListFilters = {
  status?: string;
  includeArchived?: boolean;
  scope?: "upcoming" | "all";
  q?: string;
};

export const REQUEST_STATUS_OPTIONS = [
  "リクエスト",
  "承認済",
  "却下",
  "本予約連携済",
] as const;

export async function getRequests(filters: RequestListFilters = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("reservation_requests")
    .select(
      "request_id, status, representative_name, check_in, check_out, guest_total, email, linked_reservation_id, is_archived, updated_at"
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

  if (filters.q) {
    const escaped = filters.q.replace(/[%_]/g, "");
    query = query.or(
      `request_id.ilike.%${escaped}%,representative_name.ilike.%${escaped}%,email.ilike.%${escaped}%`
    );
  }

  const { data, error } = await query;
  return {
    requests: (data ?? []) as RequestListItem[],
    error: error?.message ?? null,
  };
}

export async function getRequestById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservation_requests")
    .select(
      "*, linked_reservation:linked_reservation_id(reservation_id, representative_name, status, check_in, check_out)"
    )
    .eq("request_id", id)
    .maybeSingle();

  return {
    request: data as
      | (Record<string, unknown> & {
          linked_reservation?: {
            reservation_id: string;
            representative_name: string | null;
            status: string;
            check_in: string | null;
            check_out: string | null;
          } | null;
        })
      | null,
    error: error?.message ?? null,
  };
}

export async function getRequestStats() {
  const supabase = await createClient();
  const [active, pending, approved, rejected, linked] = await Promise.all([
    supabase
      .from("reservation_requests")
      .select("request_id", { count: "exact", head: true })
      .eq("is_archived", false),
    supabase
      .from("reservation_requests")
      .select("request_id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("status", "リクエスト"),
    supabase
      .from("reservation_requests")
      .select("request_id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("status", "承認済"),
    supabase
      .from("reservation_requests")
      .select("request_id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("status", "却下"),
    supabase
      .from("reservation_requests")
      .select("request_id", { count: "exact", head: true })
      .eq("is_archived", false)
      .eq("status", "本予約連携済"),
  ]);

  return {
    activeCount: active.count ?? 0,
    pendingCount: pending.count ?? 0,
    approvedCount: approved.count ?? 0,
    rejectedCount: rejected.count ?? 0,
    linkedCount: linked.count ?? 0,
  };
}
