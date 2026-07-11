import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { createReadClient } from "@/lib/supabase/read";
import { todayIso } from "@/lib/utils/date-label";

export type RequestListItem = {
  request_id: string;
  status: string;
  representative_name: string | null;
  last_name?: string | null;
  first_name?: string | null;
  name_kana?: string | null;
  last_name_kana?: string | null;
  first_name_kana?: string | null;
  phone?: string | null;
  check_in: string | null;
  check_out: string | null;
  guest_total: string | null;
  email: string | null;
  linked_reservation_id: string | null;
  is_archived: boolean;
  updated_at: string;
  created_at: string;
  sheet_created_at: string | null;
  reply_email_sent: boolean;
  received_ms: number;
  updated_ms: number;
};

export type RequestListFilters = {
  status?: string;
  scope?: "upcoming" | "archive" | "past";
};

export const REQUEST_STATUS_OPTIONS = [
  "リクエスト",
  "承認済",
  "却下",
  "本予約連携済",
] as const;

export async function getRequests(filters: RequestListFilters = {}) {
  const key = JSON.stringify(filters);
  return unstable_cache(
    () => getRequestsUncached(filters),
    ["requests", key],
    { tags: [CACHE_TAGS.requests], revalidate: 120 }
  )();
}

async function getRequestsUncached(filters: RequestListFilters = {}) {
  const supabase = await createReadClient();
  const today = todayIso();
  let query = supabase
    .from("reservation_requests")
    .select(
      "request_id, status, representative_name, last_name, first_name, name_kana, last_name_kana, first_name_kana, check_in, check_out, guest_total, email, phone, linked_reservation_id, is_archived, updated_at, created_at, sheet_created_at, reply_email_sent"
    )
    .order("check_in", { ascending: true, nullsFirst: false });

  if (filters.scope === "archive" || filters.scope === "past") {
    query = query.or(`is_archived.eq.true,check_out.lt.${today}`);
  } else {
    query = query.eq("is_archived", false).gte("check_out", today);
  }

  const { data, error } = await query;
  let requests = (data ?? []).map((row) => {
    const receivedSource = row.sheet_created_at || row.created_at;
    return {
      ...row,
      received_ms: receivedSource ? new Date(receivedSource).getTime() : 0,
      updated_ms: row.updated_at ? new Date(row.updated_at).getTime() : 0,
    };
  }) as RequestListItem[];

  if (filters.status) {
    requests = requests.filter((r) => {
      const s = r.status === "本予約連携済" ? "承認済" : r.status;
      return s === filters.status;
    });
  }

  return {
    requests,
    error: error?.message ?? null,
  };
}

export async function getRequestById(id: string) {
  const supabase = await createReadClient();
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
  const supabase = await createReadClient();
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
