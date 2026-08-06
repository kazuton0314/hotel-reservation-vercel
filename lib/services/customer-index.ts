import type { SupabaseClient } from "@supabase/supabase-js";
import { nextCustomerId } from "@/lib/import/id-generation";

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

export function normalizeNameForCustomerKey(name: string | null): string {
  return String(name ?? "").replace(/\s+/g, "").trim();
}

/** GAS 09_顧客索引と同じ: 正規化氏名|メール or 正規化氏名|電話(10桁以上) */
export function buildCustomerKey(
  r: Pick<ReservationRow, "email" | "phone" | "representative_name">
): string | null {
  const name = normalizeNameForCustomerKey(r.representative_name);
  const email = String(r.email ?? "").trim().toLowerCase();
  const phone = normalizePhone(r.phone);

  if (name && email) return `${name}|${email}`;
  if (name && phone.length >= 10) return `${name}|${phone}`;
  return null;
}

export function isCustomerIndexable(
  r: Pick<ReservationRow, "email" | "phone" | "representative_name">
): boolean {
  return buildCustomerKey(r) !== null;
}

function isCuCustomerId(id: string | null | undefined): boolean {
  return Boolean(id && /^CU-\d{4}-\d+$/i.test(id));
}

function firstCheckInYear(rows: ReservationRow[]): number {
  let earliest: string | null = null;
  for (const r of rows) {
    const ci = String(r.check_in ?? "").trim();
    if (!ci) continue;
    if (!earliest || ci < earliest) earliest = ci;
  }
  if (earliest && /^\d{4}/.test(earliest)) {
    return Number(earliest.slice(0, 4));
  }
  return new Date().getFullYear();
}

/**
 * 既存 CU を最優先。なければ既存 ID を維持。
 * どちらも無いときだけ CU-{年}-{連番} を新規採番。
 */
async function resolveCustomerId(
  supabase: SupabaseClient,
  rows: ReservationRow[],
  existingId: string | null
): Promise<string> {
  const fromLedgerCu = rows.find((r) => isCuCustomerId(r.customer_id))
    ?.customer_id;
  if (fromLedgerCu) return fromLedgerCu;
  if (isCuCustomerId(existingId)) return existingId as string;

  const fromLedger = rows.find((r) => r.customer_id)?.customer_id;
  if (fromLedger) return fromLedger;
  if (existingId) return existingId;

  return nextCustomerId(supabase, firstCheckInYear(rows));
}

function countsAsVisit(r: Pick<ReservationRow, "status" | "check_in" | "check_out">) {
  if (r.status === "キャンセル") return false;
  return Boolean(r.check_in && r.check_out);
}

/** 検索・詳細用（索引・リピーター判定には使わない） */
export function buildEphemeralCustomerKey(reservationId: string): string {
  return `reservation:${reservationId}`;
}

export function isEphemeralCustomerKey(key: string): boolean {
  return key.startsWith("reservation:");
}

export function reservationIdFromEphemeralKey(key: string): string | null {
  if (!isEphemeralCustomerKey(key)) return null;
  const id = key.slice("reservation:".length).trim();
  return id || null;
}

export { countsAsVisit };

async function loadRelatedReservations(
  supabase: SupabaseClient,
  reservation: ReservationRow
) {
  const phone = normalizePhone(reservation.phone);
  const { data } = await supabase
    .from("reservations")
    .select(
      "reservation_id, status, check_in, check_out, is_archived, email, phone, representative_name, name_kana, customer_id"
    )
    .or(
      [
        reservation.customer_id
          ? `customer_id.eq.${reservation.customer_id}`
          : null,
        reservation.email ? `email.ilike.${reservation.email}` : null,
        phone.length >= 10 ? `phone.ilike.%${phone}%` : null,
      ]
        .filter(Boolean)
        .join(",") || `reservation_id.eq.${reservation.reservation_id}`
    );

  return (data ?? []) as ReservationRow[];
}

export async function upsertCustomerFromReservation(
  supabase: SupabaseClient,
  reservation: ReservationRow
) {
  const customerKey = buildCustomerKey(reservation);
  if (!customerKey) return null;

  const { data: existing } = await supabase
    .from("customers")
    .select("customer_id, visit_count, last_check_out")
    .eq("customer_key", customerKey)
    .maybeSingle();

  const related = await loadRelatedReservations(supabase, reservation);
  const matched = related.filter((r) => buildCustomerKey(r) === customerKey);
  const source = matched.length ? matched : [reservation];

  let visitCount = 0;
  let lastCheckOut: string | null = null;
  for (const r of source) {
    if (!countsAsVisit(r)) continue;
    visitCount++;
    if (r.check_out && (!lastCheckOut || r.check_out > lastCheckOut)) {
      lastCheckOut = r.check_out;
    }
  }

  const customerId = await resolveCustomerId(
    supabase,
    source,
    existing?.customer_id ?? null
  );

  const profile =
    source.find((r) => r.customer_id === customerId) ??
    source.find((r) => r.representative_name) ??
    reservation;

  const record = {
    customer_id: customerId,
    customer_key: customerKey,
    representative_name: profile.representative_name,
    name_kana: profile.name_kana,
    email: profile.email,
    phone: profile.phone,
    visit_count: visitCount,
    last_check_out: lastCheckOut,
    is_repeater: visitCount >= 2,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("customers").upsert(record, { onConflict: "customer_key" });

  for (const row of source) {
    if (!row.customer_id) {
      await supabase
        .from("reservations")
        .update({ customer_id: customerId })
        .eq("reservation_id", row.reservation_id);
    }
  }

  return customerId;
}

export async function rebuildAllCustomers(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "reservation_id, customer_id, representative_name, name_kana, email, phone, check_in, check_out, status, is_archived"
    );

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ReservationRow[];
  const keys = new Set<string>();
  for (const row of rows) {
    const key = buildCustomerKey(row);
    if (key) keys.add(key);
  }

  for (const key of keys) {
    const sameKey = rows.filter((r) => buildCustomerKey(r) === key);
    const sample =
      sameKey.find((r) => r.customer_id) ??
      sameKey.find((r) => countsAsVisit(r)) ??
      sameKey[0];
    if (sample) await upsertCustomerFromReservation(supabase, sample);
  }

  return keys.size;
}
