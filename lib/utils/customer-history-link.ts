export function buildCustomerHistoryHref(fields: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  const params = new URLSearchParams();
  const name = String(fields.name ?? "").trim();
  const email = String(fields.email ?? "").trim();
  const phone = String(fields.phone ?? "").trim();
  if (name) params.set("name", name);
  if (email) params.set("email", email);
  if (phone) params.set("phone", phone);
  const qs = params.toString();
  return qs ? `/customers?${qs}` : "/customers";
}
