/**
 * 既存 CK-* 顧客IDを CU-{年}-{NNNN} 連番へ正規化する。
 * CU-2026-0077 の次（0078〜）から採番。
 *
 * Dry run: npx tsx scripts/migrate-ck-to-cu-customer-ids.ts
 * Execute: npx tsx scripts/migrate-ck-to-cu-customer-ids.ts --execute
 */
import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import { nextCustomerId, syncSequencesFromLedger } from "@/lib/import/id-generation";

loadEnvLocal();

type CustomerRow = {
  customer_id: string;
  customer_key: string;
  representative_name: string | null;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  visit_count: number;
  last_check_out: string | null;
  is_repeater: boolean;
  created_at: string | null;
};

type ReservationLite = {
  reservation_id: string;
  customer_id: string | null;
  check_in: string | null;
};

function yearFromCheckIns(rows: ReservationLite[], fallbackCreatedAt: string | null): number {
  let earliest: string | null = null;
  for (const r of rows) {
    const ci = String(r.check_in ?? "").trim();
    if (!ci) continue;
    if (!earliest || ci < earliest) earliest = ci;
  }
  if (earliest && /^\d{4}/.test(earliest)) return Number(earliest.slice(0, 4));
  if (fallbackCreatedAt && /^\d{4}/.test(fallbackCreatedAt)) {
    return Number(fallbackCreatedAt.slice(0, 4));
  }
  return new Date().getFullYear();
}

async function run() {
  const execute = process.argv.includes("--execute");
  const supabase = createAdminClient();

  const { data: ckCustomers, error } = await supabase
    .from("customers")
    .select(
      "customer_id, customer_key, representative_name, name_kana, email, phone, visit_count, last_check_out, is_repeater, created_at"
    )
    .like("customer_id", "CK-%");
  if (error) throw error;

  const targets = (ckCustomers ?? []) as CustomerRow[];
  if (!targets.length) {
    console.log("CK-* 顧客はありません。");
    return;
  }

  const oldIds = targets.map((t) => t.customer_id);
  const { data: reservations, error: resErr } = await supabase
    .from("reservations")
    .select("reservation_id, customer_id, check_in")
    .in("customer_id", oldIds);
  if (resErr) throw resErr;

  const byCustomer = new Map<string, ReservationLite[]>();
  for (const r of (reservations ?? []) as ReservationLite[]) {
    const id = String(r.customer_id ?? "");
    const list = byCustomer.get(id) ?? [];
    list.push(r);
    byCustomer.set(id, list);
  }

  const plan = targets
    .map((c) => {
      const linked = byCustomer.get(c.customer_id) ?? [];
      const year = yearFromCheckIns(linked, c.created_at);
      const sortKey =
        linked
          .map((r) => r.check_in)
          .filter(Boolean)
          .sort()[0] ??
        c.created_at ??
        c.customer_id;
      return { customer: c, year, sortKey, linkedCount: linked.length };
    })
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1;
      return a.customer.customer_id.localeCompare(b.customer.customer_id);
    });

  console.log("oldId\tname\tyear\tlinked\tsortKey");
  for (const p of plan) {
    console.log(
      [
        p.customer.customer_id,
        p.customer.representative_name ?? "",
        p.year,
        p.linkedCount,
        p.sortKey,
      ].join("\t")
    );
  }

  if (!execute) {
    console.log(`\nDry run: ${plan.length} 件。実行するには --execute`);
    return;
  }

  // 採番器を既存 CU 最大値へ同期してから発行
  await syncSequencesFromLedger(supabase);

  const remaps: { oldId: string; newId: string; name: string }[] = [];
  for (const p of plan) {
    const newId = await nextCustomerId(supabase, p.year);
    const oldId = p.customer.customer_id;
    const now = new Date().toISOString();

    // customer_key UNIQUE のため、PK差し替えは insert(new) → update refs → delete(old)
    const { error: insErr } = await supabase.from("customers").insert({
      customer_id: newId,
      customer_key: `${p.customer.customer_key}__migrating__${Date.now()}`,
      representative_name: p.customer.representative_name,
      name_kana: p.customer.name_kana,
      email: p.customer.email,
      phone: p.customer.phone,
      visit_count: p.customer.visit_count,
      last_check_out: p.customer.last_check_out,
      is_repeater: p.customer.is_repeater,
      updated_at: now,
    });
    if (insErr) throw insErr;

    const { error: resUpdErr } = await supabase
      .from("reservations")
      .update({ customer_id: newId, updated_at: now })
      .eq("customer_id", oldId);
    if (resUpdErr) throw resUpdErr;

    const { error: delErr } = await supabase
      .from("customers")
      .delete()
      .eq("customer_id", oldId);
    if (delErr) throw delErr;

    const { error: keyErr } = await supabase
      .from("customers")
      .update({
        customer_key: p.customer.customer_key,
        updated_at: now,
      })
      .eq("customer_id", newId);
    if (keyErr) throw keyErr;

    remaps.push({
      oldId,
      newId,
      name: p.customer.representative_name ?? "",
    });
    console.log(`OK\t${oldId}\t->\t${newId}\t${p.customer.representative_name}`);
  }

  await syncSequencesFromLedger(supabase);

  const { data: seq } = await supabase
    .from("import_sequences")
    .select("key,current_value")
    .eq("key", "cu_2026")
    .maybeSingle();

  console.log("\nRemap summary:");
  for (const r of remaps) {
    console.log(`${r.oldId}\t${r.newId}\t${r.name}`);
  }
  console.log(
    `\ncu_2026 current_value=${seq?.current_value ?? "n/a"} next=${
      (seq?.current_value ?? 0) + 1
    }`
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
