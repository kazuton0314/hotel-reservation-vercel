import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReservationFilters, ReservationListQuery } from "@/lib/queries/reservations";
import { UNASSIGNED_ROOM_FILTER } from "@/lib/services/reservation-list-filter";
import { idPrefixIlikePattern, isIdLikeQuery } from "@/lib/utils/id-search";
import type { ListSort } from "@/lib/utils/list-sort";
import { escapeIlike } from "@/lib/utils/sql-ilike";

/** DB 列へ直接 eq/in できる絞り込み（SQL ページング経路で適用） */
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
  // SQL ilike はカナ折り・電話数字正規化ができないため、キーワード検索は JS 側に統一
  if (String(list?.q ?? "").trim()) return true;
  if (!list?.filterField || !list.filterValue) return false;
  // SQL で完結する絞り込み以外はすべてメモリ側（未知フィールドの取りこぼし防止）
  if (isSqlEqReservationFilterField(list.filterField)) return false;
  if (
    list.filterField === "roomId" &&
    list.filterValue !== UNASSIGNED_ROOM_FILTER
  ) {
    return false;
  }
  // assignment_status は派生キャッシュ。未割当は実部屋割＋人数一致で判定する
  return true;
}

export function needsInMemoryRequestListProcessing(
  list?: { filterField?: string; filterValue?: string; q?: string }
): boolean {
  if (String(list?.q ?? "").trim()) return true;
  if (!list?.filterField || !list.filterValue) return false;
  // リクエスト絞り込みは業務フラグ判定（replyEmail 等）。未知フィールドも取りこぼさない
  return true;
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
