import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReservationFilters, ReservationListQuery } from "@/lib/queries/reservations";
import { UNASSIGNED_ROOM_FILTER } from "@/lib/services/reservation-list-filter";
import { idPrefixIlikePattern, isIdLikeQuery } from "@/lib/utils/id-search";
import type { ListSort } from "@/lib/utils/list-sort";
import { escapeIlike } from "@/lib/utils/sql-ilike";

/** DB 列へ直接 eq できる絞り込み（SQL ページング経路で適用） */
const SQL_EQ_RESERVATION_FILTER_FIELDS = new Set([
  "channel",
  "meal",
  "bbq",
  "payment_status",
]);

export function isSqlEqReservationFilterField(field?: string): boolean {
  return Boolean(field && SQL_EQ_RESERVATION_FILTER_FIELDS.has(field));
}

/** 人数不一致・連絡・同行者・部屋未割当など、JS 側の業務ロジックが必要な絞り込み */
export function needsInMemoryReservationListProcessing(
  filters: ReservationFilters,
  list?: ReservationListQuery
): boolean {
  if (filters.mailPending || filters.companionPending) return true;
  if (!list?.filterField || !list.filterValue) return false;
  // assignment_status は派生キャッシュ。アーカイブ後や人数不一致の取りこぼしがあるため
  // 未割当は実部屋割＋人数一致で判定する（SQL の eq では足りない）
  if (
    list.filterField === "roomId" &&
    list.filterValue === UNASSIGNED_ROOM_FILTER
  ) {
    return true;
  }
  return (
    list.filterField === "guestTotal" ||
    list.filterField === "companionInfo" ||
    list.filterField === "completionEmail"
  );
}

export function needsInMemoryRequestListProcessing(
  list?: { filterField?: string; filterValue?: string }
): boolean {
  if (!list?.filterField || !list.filterValue) return false;
  return list.filterField === "replyEmail";
}

export function applyReservationKeywordFilter<
  T extends { ilike: (col: string, pattern: string) => T; or: (filters: string) => T },
>(query: T, rawKeyword?: string): T {
  const keyword = String(rawKeyword ?? "").trim();
  if (!keyword) return query;

  if (isIdLikeQuery(keyword)) {
    return query.ilike("reservation_id", `${idPrefixIlikePattern(keyword)}%`);
  }

  const q = escapeIlike(keyword);
  return query.or(
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

export function applyRequestKeywordFilter<
  T extends { ilike: (col: string, pattern: string) => T; or: (filters: string) => T },
>(query: T, rawKeyword?: string): T {
  const keyword = String(rawKeyword ?? "").trim();
  if (!keyword) return query;

  if (isIdLikeQuery(keyword)) {
    return query.ilike("request_id", `${idPrefixIlikePattern(keyword)}%`);
  }

  const q = escapeIlike(keyword);
  return query.or(
    [
      `representative_name.ilike.%${q}%`,
      `name_kana.ilike.%${q}%`,
      `last_name.ilike.%${q}%`,
      `first_name.ilike.%${q}%`,
      `last_name_kana.ilike.%${q}%`,
      `first_name_kana.ilike.%${q}%`,
      `email.ilike.%${q}%`,
      `phone.ilike.%${q}%`,
    ].join(",")
  );
}

export function applyReservationListOrder<
  T extends { order: (col: string, opts: { ascending: boolean; nullsFirst: boolean }) => T },
>(query: T, sort: ListSort): T {
  const asc = sort.dir === "asc";
  if (sort.field === "stay") {
    return query
      .order("check_in", { ascending: asc, nullsFirst: false })
      .order("reservation_id", { ascending: asc, nullsFirst: false });
  }
  if (sort.field === "received") {
    return query
      .order("sheet_created_at", { ascending: asc, nullsFirst: false })
      .order("created_at", { ascending: asc, nullsFirst: false })
      .order("reservation_id", { ascending: asc, nullsFirst: false });
  }
  return query
    .order("updated_at", { ascending: asc, nullsFirst: false })
    .order("reservation_id", { ascending: asc, nullsFirst: false });
}

export function applyRequestListOrder<
  T extends { order: (col: string, opts: { ascending: boolean; nullsFirst: boolean }) => T },
>(query: T, sort: ListSort): T {
  const asc = sort.dir === "asc";
  if (sort.field === "stay") {
    return query
      .order("check_in", { ascending: asc, nullsFirst: false })
      .order("request_id", { ascending: asc, nullsFirst: false });
  }
  if (sort.field === "received") {
    return query
      .order("sheet_created_at", { ascending: asc, nullsFirst: false })
      .order("created_at", { ascending: asc, nullsFirst: false })
      .order("request_id", { ascending: asc, nullsFirst: false });
  }
  return query
    .order("updated_at", { ascending: asc, nullsFirst: false })
    .order("request_id", { ascending: asc, nullsFirst: false });
}

export async function reservationIdsForRoomFilter(
  supabase: SupabaseClient,
  roomId: string,
  includeArchivedAssignments: boolean
): Promise<string[]> {
  let assignQuery = supabase
    .from("room_assignments")
    .select("reservation_id")
    .eq("room_id", roomId);
  if (!includeArchivedAssignments) {
    assignQuery = assignQuery.eq("is_archived", false);
  }
  const { data } = await assignQuery;
  return [...new Set((data ?? []).map((row) => row.reservation_id))];
}
