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

export function revalidateReservationDetail(reservationId: string) {
  updateTag(CACHE_TAGS.reservation(reservationId));
  revalidateReservationsList();
  updateTag(CACHE_TAGS.rooms);
  updateTag(CACHE_TAGS.customers);
}

export function revalidateRequestsList() {
  updateTag(CACHE_TAGS.requests);
  revalidateDashboard();
}

export function revalidateRequestDetail(requestId: string) {
  updateTag(CACHE_TAGS.request(requestId));
  revalidateRequestsList();
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
