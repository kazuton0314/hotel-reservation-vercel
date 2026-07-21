import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/tags";
import {
  displayRequestStatus,
  REQUEST_WORKFLOW_STATUSES,
} from "@/lib/domain/request-status";
import { createReadClient } from "@/lib/supabase/read";
import { applyRequestListFilter } from "@/lib/services/request-list-filter";
import {
  applyRequestKeywordFilter,
  needsInMemoryRequestListProcessing,
} from "@/lib/services/reservation-list-query";
import { todayIso } from "@/lib/utils/date-label";
import {
  DEFAULT_LIST_PAGE_SIZE,
  paginateItems,
  parsePageParam,
} from "@/lib/utils/list-pagination";
import { filterListBySearch } from "@/lib/utils/list-search";
import { parseListSort, sortListItems } from "@/lib/utils/list-sort";

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
  internal_memo: string | null;
  inquiry: string | null;
  received_ms: number;
  updated_ms: number;
};

export type RequestListQuery = {
  q?: string;
  checkIn?: string;
  filterField?: string;
  filterValue?: string;
  sort?: string;
  dir?: string;
  page?: number;
  pageSize?: number;
};

export type RequestListFilters = {
  status?: string;
  scope?: "upcoming" | "archive" | "past";
  list?: RequestListQuery;
};

/** @deprecated domain/request-status の REQUEST_WORKFLOW_STATUSES を使う */
export const REQUEST_STATUS_OPTIONS = REQUEST_WORKFLOW_STATUSES;

export async function getRequests(filters: RequestListFilters = {}) {
  const key = JSON.stringify(filters);
  return unstable_cache(
    () => getRequestsUncached(filters),
    ["requests", key],
    { tags: [CACHE_TAGS.requests], revalidate: 120 }
  )();
}

const REQUEST_LIST_SELECT =
  "request_id, status, representative_name, last_name, first_name, name_kana, last_name_kana, first_name_kana, check_in, check_out, guest_total, email, phone, linked_reservation_id, is_archived, updated_at, created_at, sheet_created_at, reply_email_sent, internal_memo, inquiry";

function mapRequestListRows(
  data: Record<string, unknown>[]
): RequestListItem[] {
  return data.map((row) => {
    const receivedSource =
      (row.sheet_created_at as string | null) ||
      (row.created_at as string | null);
    return {
      ...(row as RequestListItem),
      status: displayRequestStatus(row.status as string),
      received_ms: receivedSource ? new Date(receivedSource).getTime() : 0,
      updated_ms: row.updated_at
        ? new Date(String(row.updated_at)).getTime()
        : 0,
    };
  });
}

async function getRequestsUncached(filters: RequestListFilters = {}) {
  const supabase = await createReadClient();
  const today = todayIso();
  const list = filters.list;
  const paged = Boolean(list);
  const useSqlPagination =
    paged && !needsInMemoryRequestListProcessing(list);

  if (useSqlPagination && list) {
    const sort =
      list.sort || list.dir
        ? parseListSort(list.sort, list.dir)
        : ({ field: "received", dir: "desc" } as const);
    const page = list.page ?? parsePageParam(undefined);
    const pageSize = list.pageSize ?? DEFAULT_LIST_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("reservation_requests")
      .select(REQUEST_LIST_SELECT, { count: "exact" });

    if (filters.scope === "archive" || filters.scope === "past") {
      query = query.or(`is_archived.eq.true,check_out.lt.${today}`);
    } else {
      query = query.eq("is_archived", false).gte("check_out", today);
    }
    if (filters.status === "承認済") {
      query = query.in("status", ["承認済", "本予約連携済"]);
    } else if (filters.status) {
      query = query.eq("status", filters.status);
    }

    const checkIn = String(list.checkIn ?? "").trim();
    if (checkIn) {
      query = query.eq("check_in", checkIn);
    }
    query = applyRequestKeywordFilter(query, list.q);

    const asc = sort.dir === "asc";
    if (sort.field === "stay") {
      query = query.order("check_in", { ascending: asc, nullsFirst: false });
    } else if (sort.field === "received") {
      query = query
        .order("sheet_created_at", { ascending: asc, nullsFirst: false })
        .order("created_at", { ascending: asc, nullsFirst: false });
    } else {
      query = query.order("updated_at", { ascending: asc, nullsFirst: false });
    }

    const { data, error, count } = await query.range(from, to);
    if (error) {
      return { requests: [] as RequestListItem[], total: 0, error: error.message };
    }

    return {
      requests: mapRequestListRows((data ?? []) as Record<string, unknown>[]),
      total: count ?? 0,
      error: null,
    };
  }

  let query = supabase
    .from("reservation_requests")
    .select(REQUEST_LIST_SELECT)
    .order("check_in", { ascending: true, nullsFirst: false });

  if (filters.scope === "archive" || filters.scope === "past") {
    query = query.or(`is_archived.eq.true,check_out.lt.${today}`);
  } else {
    query = query.eq("is_archived", false).gte("check_out", today);
  }
  if (filters.status === "承認済") {
    query = query.in("status", ["承認済", "本予約連携済"]);
  } else if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) {
    return { requests: [] as RequestListItem[], total: 0, error: error.message };
  }

  let requests = mapRequestListRows((data ?? []) as Record<string, unknown>[]);

  if (!paged) {
    return { requests, total: requests.length, error: null };
  }

  const filtered = applyRequestListFilter(
    requests,
    list?.filterField,
    list?.filterValue
  );
  const searched = filterListBySearch(
    filtered.map((item) => ({ ...item, id: item.request_id })),
    list?.q,
    list?.checkIn
  );
  const sort =
    list?.sort || list?.dir
      ? parseListSort(list?.sort, list?.dir)
      : ({ field: "received", dir: "desc" } as const);
  const sorted = sortListItems(searched, sort);
  const page = list?.page ?? parsePageParam(undefined);
  const pageSize = list?.pageSize ?? DEFAULT_LIST_PAGE_SIZE;
  const pagedResult = paginateItems(sorted, page, pageSize);

  return {
    requests: pagedResult.items,
    total: pagedResult.total,
    error: null,
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
      .not("linked_reservation_id", "is", null),
  ]);

  return {
    activeCount: active.count ?? 0,
    pendingCount: pending.count ?? 0,
    approvedCount: approved.count ?? 0,
    rejectedCount: rejected.count ?? 0,
    /** 本予約リンクあり（status ではなく linked_reservation_id） */
    linkedCount: linked.count ?? 0,
  };
}
