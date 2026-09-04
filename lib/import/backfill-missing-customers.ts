import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCustomerKey,
  isCustomerIndexable,
  upsertCustomerFromReservation,
} from "@/lib/services/customer-index";

export type MissingCustomerCandidate = {
  reservation_id: string;
  import_source: string | null;
  representative_name: string | null;
  email: string | null;
  phone: string | null;
  check_in: string | null;
  status: string;
  customer_key: string;
};

export type BackfillMissingCustomersResult = {
  dryRun: boolean;
  candidates: MissingCustomerCandidate[];
  linked: Array<{ reservation_id: string; customer_id: string }>;
  errors: Array<{ reservation_id: string; message: string }>;
};

type ReservationRow = {
  reservation_id: string;
  import_source: string | null;
  representative_name: string | null;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string;
  customer_id: string | null;
  is_archived: boolean | null;
};

/**
 * customer_id 未設定かつ索引可能な予約だけを対象にする。
 * 既に customer_id がある行は触らない（既存運用を壊さない）。
 */
export async function listReservationsMissingCustomers(
  supabase: SupabaseClient,
  options: { importSources?: string[] } = {}
): Promise<MissingCustomerCandidate[]> {
  let query = supabase
    .from("reservations")
    .select(
      "reservation_id, import_source, representative_name, name_kana, email, phone, check_in, check_out, status, customer_id, is_archived"
    )
    .is("customer_id", null);

  const sources = options.importSources?.filter(Boolean);
  if (sources?.length === 1) {
    query = query.eq("import_source", sources[0]!);
  } else if (sources && sources.length > 1) {
    query = query.in("import_source", sources);
  }

  const { data, error } = await query.order("reservation_id");
  if (error) throw new Error(error.message);

  const out: MissingCustomerCandidate[] = [];
  for (const row of (data ?? []) as ReservationRow[]) {
    if (!isCustomerIndexable(row)) continue;
    const customerKey = buildCustomerKey(row);
    if (!customerKey) continue;
    out.push({
      reservation_id: row.reservation_id,
      import_source: row.import_source,
      representative_name: row.representative_name,
      email: row.email,
      phone: row.phone,
      check_in: row.check_in,
      status: row.status,
      customer_key: customerKey,
    });
  }
  return out;
}

/**
 * 未紐づけ予約にのみ顧客索引を付与する。
 * - customer_id が既にある予約は対象外
 * - upsertCustomerFromReservation を1件ずつ呼び、既存 customer_key があれば再利用
 */
export async function backfillMissingCustomers(
  supabase: SupabaseClient,
  options: { dryRun?: boolean; importSources?: string[] } = {}
): Promise<BackfillMissingCustomersResult> {
  const dryRun = options.dryRun !== false;
  const candidates = await listReservationsMissingCustomers(supabase, {
    importSources: options.importSources,
  });

  const linked: Array<{ reservation_id: string; customer_id: string }> = [];
  const errors: Array<{ reservation_id: string; message: string }> = [];

  if (dryRun) {
    return { dryRun, candidates, linked, errors };
  }

  for (const c of candidates) {
    const { data: row, error } = await supabase
      .from("reservations")
      .select(
        "reservation_id, import_source, representative_name, name_kana, email, phone, check_in, check_out, status, customer_id, is_archived"
      )
      .eq("reservation_id", c.reservation_id)
      .maybeSingle();
    if (error) {
      errors.push({ reservation_id: c.reservation_id, message: error.message });
      continue;
    }
    if (!row) {
      errors.push({
        reservation_id: c.reservation_id,
        message: "reservation missing",
      });
      continue;
    }
    // 実行中に他処理で付与された場合はスキップ（上書きしない）
    if (String(row.customer_id ?? "").trim()) {
      continue;
    }

    try {
      const customerId = await upsertCustomerFromReservation(supabase, {
        reservation_id: String(row.reservation_id),
        customer_id: (row.customer_id as string | null) ?? null,
        representative_name: (row.representative_name as string | null) ?? null,
        name_kana: (row.name_kana as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        check_in: (row.check_in as string | null) ?? null,
        check_out: (row.check_out as string | null) ?? null,
        status: String(row.status ?? ""),
        is_archived: Boolean(row.is_archived),
      });
      if (customerId) {
        linked.push({
          reservation_id: c.reservation_id,
          customer_id: customerId,
        });
      } else {
        errors.push({
          reservation_id: c.reservation_id,
          message: "not indexable at execute time",
        });
      }
    } catch (e) {
      errors.push({
        reservation_id: c.reservation_id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { dryRun, candidates, linked, errors };
}
