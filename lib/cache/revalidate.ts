import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache/tags";

export function revalidateDashboard() {
  updateTag(CACHE_TAGS.dashboard);
  updateTag(CACHE_TAGS.calendar);
}

export function revalidateReservationsList() {
  updateTag(CACHE_TAGS.reservations);
  revalidateDashboard();
}

/** 予約の本体・部屋・顧客に触れる更新（日付・人数・ステータス・割当など） */
export function revalidateReservationDetail(reservationId: string) {
  updateTag(CACHE_TAGS.reservation(reservationId));
  revalidateReservationsList();
  updateTag(CACHE_TAGS.rooms);
  updateTag(CACHE_TAGS.customers);
}

/**
 * メール連絡フラグのみの更新。
 * カレンダー・部屋・顧客キャッシュは触らない。
 */
export function revalidateReservationMailFlags(reservationId: string) {
  updateTag(CACHE_TAGS.reservation(reservationId));
  updateTag(CACHE_TAGS.reservations);
  updateTag(CACHE_TAGS.dashboard);
}

/** 一括保存後: 詳細タグのみ個別、一覧・部屋・顧客は1回 */
export function revalidateReservationDetailsBatch(reservationIds: string[]) {
  const unique = [...new Set(reservationIds.filter(Boolean))];
  if (!unique.length) return;
  for (const id of unique) {
    updateTag(CACHE_TAGS.reservation(id));
  }
  revalidateReservationsList();
  updateTag(CACHE_TAGS.rooms);
  updateTag(CACHE_TAGS.customers);
}

/** 一括の連絡フラグのみ */
export function revalidateReservationMailFlagsBatch(reservationIds: string[]) {
  const unique = [...new Set(reservationIds.filter(Boolean))];
  if (!unique.length) return;
  for (const id of unique) {
    updateTag(CACHE_TAGS.reservation(id));
  }
  updateTag(CACHE_TAGS.reservations);
  updateTag(CACHE_TAGS.dashboard);
}

/** 一括のリクエスト更新後 */
export function revalidateRequestDetailsBatch(
  requestIds: string[],
  linkedReservationIds: string[] = []
) {
  const requests = [...new Set(requestIds.filter(Boolean))];
  const reservations = [...new Set(linkedReservationIds.filter(Boolean))];
  if (!requests.length && !reservations.length) return;
  for (const id of requests) {
    updateTag(CACHE_TAGS.request(id));
  }
  revalidateRequestsList();
  if (reservations.length) {
    revalidateReservationDetailsBatch(reservations);
  }
}

export function revalidateRequestsList() {
  updateTag(CACHE_TAGS.requests);
  revalidateDashboard();
}

export function revalidateRequestDetail(requestId: string) {
  updateTag(CACHE_TAGS.request(requestId));
  revalidateRequestsList();
}

/** リクエストの連絡フラグのみ */
export function revalidateRequestMailFlags(requestId: string) {
  updateTag(CACHE_TAGS.request(requestId));
  updateTag(CACHE_TAGS.requests);
  updateTag(CACHE_TAGS.dashboard);
}

export function revalidateRooms() {
  updateTag(CACHE_TAGS.rooms);
  revalidateDashboard();
}

export function revalidateCustomers() {
  updateTag(CACHE_TAGS.customers);
}

export function revalidateCustomerDetail(customerId: string) {
  updateTag(CACHE_TAGS.customer(customerId));
  revalidateCustomers();
}

export function revalidateMailTemplates() {
  updateTag(CACHE_TAGS.mailTemplates);
}

export function revalidateMailLogs(entityType: string, entityId: string) {
  updateTag(CACHE_TAGS.mailLogs(entityType, entityId));
}

export function revalidateAfterSync() {
  revalidateDashboard();
  revalidateReservationsList();
  revalidateRequestsList();
  revalidateCustomers();
}
