import type { CustomerSearchCriteria } from "@/lib/queries/customers";

export const CUSTOMER_SEARCH_CRITERIA_KEYS = [
  "name",
  "companionName",
  "email",
  "phone",
  "reservationId",
  "customerId",
] as const satisfies readonly (keyof CustomerSearchCriteria)[];

/** 顧客索引の検索条件を URL クエリへ（詳細→戻る／下ナビ復元用） */
export function buildCustomerSearchHref(
  criteria: CustomerSearchCriteria
): string {
  const params = new URLSearchParams();
  for (const key of CUSTOMER_SEARCH_CRITERIA_KEYS) {
    const value = String(criteria[key] ?? "").trim();
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/customers?${qs}` : "/customers";
}

export function buildCustomerHistoryHref(fields: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  return buildCustomerSearchHref({
    name: String(fields.name ?? "").trim() || undefined,
    email: String(fields.email ?? "").trim() || undefined,
    phone: String(fields.phone ?? "").trim() || undefined,
  });
}
