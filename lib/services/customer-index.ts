import type { SupabaseClient } from "@supabase/supabase-js";

type ReservationRow = {
  reservation_id: string;
  customer_id: string | null;
  representative_name: string | null;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string;
  is_archived: boolean;
};

export function normalizePhone(value: string | null): string {
  return String(value ?? "").replace(/[^\d]/g, "");
}

export function buildCustomerKey(r: Pick<ReservationRow, "customer_id" | "email" | "phone" | "representative_name" | "reservation_id">): string {
  if (r.customer_id) return `cid:${r.customer_id}`;
  const email = String(r.email ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = normalizePhone(r.phone);
  if (phone.length >= 4) return `phone:${phone}`;
  const name = String(r.representative_name ?? "").trim().toLowerCase();
  return `name:${name || r.reservation_id}`;
}

function deriveCustomerId(
  row: ReservationRow,
  customerKey: string,
  existingId: string | null
): string {
  if (row.customer_id) return row.customer_id;
  if (existingId) return existingId;
  const slug = customerKey.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
  return `CK-${slug || row.reservation_id}`;
}

export async function upsertCustomerFromReservation(
  supabase: SupabaseClient,
  reservation: ReservationRow
) {
  if (reservation.is_archived) return;

  const customerKey = buildCustomerKey(reservation);
  const { data: existing } = await supabase
    .from("customers")
    .select("customer_id, visit_count, last_check_out")
    .eq("customer_key", customerKey)
    .maybeSingle();

  const { data: related } = await supabase
    .from("reservations")
    .select("reservation_id, status, check_out, is_archived, email, phone, representative_name, name_kana, customer_id")
    .eq("is_archived", false)
    .or(
      [
        `customer_id.eq.${reservation.customer_id ?? "___none___"}`,
        reservation.email ? `email.ilike.${reservation.email}` : null,
      ]
        .filter(Boolean)
        .join(",") || `reservation_id.eq.${reservation.reservation_id}`
    );

  const rows = (related ?? []) as ReservationRow[];
  const matched = rows.filter((r) => buildCustomerKey(r) === customerKey);
  const source = matched.length ? matched : [reservation];

  let visitCount = 0;
  let lastCheckOut: string | null = null;
  for (const r of source) {
    if (r.status !== "キャンセル") visitCount++;
    if (r.check_out && (!lastCheckOut || r.check_out > lastCheckOut)) {
      lastCheckOut = r.check_out;
    }
  }

  const customerId = deriveCustomerId(
    reservation,
    customerKey,
    existing?.customer_id ?? null
  );

  const record = {
    customer_id: customerId,
    customer_key: customerKey,
    representative_name: reservation.representative_name,
    name_kana: reservation.name_kana,
    email: reservation.email,
    phone: reservation.phone,
    visit_count: visitCount,
    last_check_out: lastCheckOut,
    is_repeater: visitCount >= 2,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("customers").upsert(record, { onConflict: "customer_key" });

  if (!reservation.customer_id) {
    await supabase
      .from("reservations")
      .update({ customer_id: customerId })
      .eq("reservation_id", reservation.reservation_id);
  }

  return customerId;
}

export async function rebuildAllCustomers(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "reservation_id, customer_id, representative_name, name_kana, email, phone, check_in, check_out, status, is_archived"
    )
    .eq("is_archived", false);

  if (error) throw new Error(error.message);

  const keys = new Set<string>();
  for (const row of (data ?? []) as ReservationRow[]) {
    keys.add(buildCustomerKey(row));
  }

  for (const key of keys) {
    const sample = ((data ?? []) as ReservationRow[]).find(
      (r) => buildCustomerKey(r) === key
    );
    if (sample) await upsertCustomerFromReservation(supabase, sample);
  }

  return keys.size;
}
