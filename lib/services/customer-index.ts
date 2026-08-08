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

type CustomerRow = {
  customer_id: string;
  customer_key: string;
  visit_count: number | null;
  last_check_out: string | null;
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

async function loadCustomerById(
  supabase: SupabaseClient,
  customerId: string
): Promise<CustomerRow | null> {
  const { data } = await supabase
    .from("customers")
    .select("customer_id, customer_key, visit_count, last_check_out")
    .eq("customer_id", customerId)
    .maybeSingle();
  return (data as CustomerRow | null) ?? null;
}

async function loadCustomerByKey(
  supabase: SupabaseClient,
  customerKey: string
): Promise<CustomerRow | null> {
  const { data } = await supabase
    .from("customers")
    .select("customer_id, customer_key, visit_count, last_check_out")
    .eq("customer_key", customerKey)
    .maybeSingle();
  return (data as CustomerRow | null) ?? null;
}

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

function overlayReservation(
  rows: ReservationRow[],
  reservation: ReservationRow
): ReservationRow[] {
  const map = new Map(rows.map((r) => [r.reservation_id, r]));
  map.set(reservation.reservation_id, reservation);
  return [...map.values()];
}

function computeVisitStats(source: ReservationRow[]) {
  let visitCount = 0;
  let lastCheckOut: string | null = null;
  for (const r of source) {
    if (!countsAsVisit(r)) continue;
    visitCount++;
    if (r.check_out && (!lastCheckOut || r.check_out > lastCheckOut)) {
      lastCheckOut = r.check_out;
    }
  }
  return { visitCount, lastCheckOut };
}

function pickProfileSample(rows: ReservationRow[]): ReservationRow {
  return (
    [...rows].sort((a, b) =>
      String(b.check_in ?? "").localeCompare(String(a.check_in ?? ""))
    )[0] ?? rows[0]
  );
}

/**
 * 予約保存時の顧客索引更新。
 * - 予約に customer_id が付いているときは、氏名変更（ひらがな→漢字など）でも
 *   別人を作らず、その顧客行を in-place 更新する（customer_key も付け替え）。
 * - 未紐づけのときだけ、従来どおり customer_key で照合／新規作成する。
 */
export async function upsertCustomerFromReservation(
  supabase: SupabaseClient,
  reservation: ReservationRow
) {
  const customerKey = buildCustomerKey(reservation);
  if (!customerKey) return null;

  const related = await loadRelatedReservations(supabase, reservation);
  const linkedId = String(reservation.customer_id ?? "").trim() || null;
  const linkedCustomer = linkedId
    ? await loadCustomerById(supabase, linkedId)
    : null;
  const existingByKey = await loadCustomerByKey(supabase, customerKey);

  let source: ReservationRow[];
  if (linkedCustomer) {
    const byId = related.filter(
      (r) => r.customer_id === linkedCustomer.customer_id
    );
    source = overlayReservation(byId.length ? byId : [reservation], reservation);
  } else {
    const matched = related.filter((r) => buildCustomerKey(r) === customerKey);
    source = overlayReservation(
      matched.length ? matched : [reservation],
      reservation
    );
  }

  const customerId = await resolveCustomerId(
    supabase,
    source,
    linkedCustomer?.customer_id ?? existingByKey?.customer_id ?? null
  );

  // 新しいキーが別顧客に取られていたら、そちらをこの顧客へ統合してキーを空ける
  if (existingByKey && existingByKey.customer_id !== customerId) {
    const nowIso = new Date().toISOString();
    await supabase
      .from("reservations")
      .update({ customer_id: customerId, updated_at: nowIso })
      .eq("customer_id", existingByKey.customer_id);
    await supabase
      .from("customers")
      .delete()
      .eq("customer_id", existingByKey.customer_id);

    const mergedRelated = await loadRelatedReservations(supabase, {
      ...reservation,
      customer_id: customerId,
    });
    source = overlayReservation(
      mergedRelated.filter(
        (r) =>
          r.customer_id === customerId ||
          buildCustomerKey(r) === customerKey ||
          r.reservation_id === reservation.reservation_id
      ),
      reservation
    );
  }

  const { visitCount, lastCheckOut } = computeVisitStats(source);
  const nowIso = new Date().toISOString();
  const record = {
    customer_id: customerId,
    customer_key: customerKey,
    // 保存中の予約の氏名・連絡先を正とする（漢字修正などが顧客側へ反映される）
    representative_name: reservation.representative_name,
    name_kana: reservation.name_kana,
    email: reservation.email,
    phone: reservation.phone,
    visit_count: visitCount,
    last_check_out: lastCheckOut,
    is_repeater: visitCount >= 2,
    updated_at: nowIso,
  };

  const existingRow = await loadCustomerById(supabase, customerId);
  if (existingRow) {
    const { error } = await supabase
      .from("customers")
      .update({
        customer_key: record.customer_key,
        representative_name: record.representative_name,
        name_kana: record.name_kana,
        email: record.email,
        phone: record.phone,
        visit_count: record.visit_count,
        last_check_out: record.last_check_out,
        is_repeater: record.is_repeater,
        updated_at: record.updated_at,
      })
      .eq("customer_id", customerId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("customers").insert(record);
    if (error) throw new Error(error.message);
  }

  for (const row of source) {
    if (row.customer_id !== customerId) {
      await supabase
        .from("reservations")
        .update({ customer_id: customerId, updated_at: nowIso })
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
  const seen = new Set<string>();
  let groupCount = 0;

  // 1) 既に customer_id がある予約は ID 単位でまとめて更新（氏名ゆれでも分裂させない）
  const customerIds = [
    ...new Set(
      rows
        .map((r) => String(r.customer_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  for (const customerId of customerIds) {
    const group = rows.filter((r) => r.customer_id === customerId);
    const sample = pickProfileSample(group);
    if (!sample || !buildCustomerKey(sample)) continue;
    await upsertCustomerFromReservation(supabase, sample);
    group.forEach((r) => seen.add(r.reservation_id));
    groupCount += 1;
  }

  // 2) 未紐づけは従来どおり customer_key 単位
  const keys = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.reservation_id)) continue;
    const key = buildCustomerKey(row);
    if (key) keys.add(key);
  }

  for (const key of keys) {
    const sameKey = rows.filter(
      (r) => !seen.has(r.reservation_id) && buildCustomerKey(r) === key
    );
    const sample =
      sameKey.find((r) => countsAsVisit(r)) ??
      sameKey[0];
    if (sample) {
      await upsertCustomerFromReservation(supabase, sample);
      sameKey.forEach((r) => seen.add(r.reservation_id));
      groupCount += 1;
    }
  }

  return groupCount;
}
