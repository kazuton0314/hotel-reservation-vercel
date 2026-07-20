import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import {
  normalizeGuestBreakdownForStorage,
  normalizeGuestTotalForStorage,
} from "@/lib/utils/guest-count-format";

loadEnvLocal();

const GUEST_BREAKDOWN_KEYS = [
  "adult_male",
  "adult_female",
  "boy_student",
  "girl_student",
  "age_3plus",
  "under_3",
] as const;

async function backfillTable(
  supabase: ReturnType<typeof createAdminClient>,
  table: "reservations" | "reservation_requests",
  idColumn: "reservation_id" | "request_id",
  withBreakdown: boolean
) {
  const select = withBreakdown
    ? `${idColumn},guest_total,${GUEST_BREAKDOWN_KEYS.join(",")}`
    : `${idColumn},guest_total`;

  const pageSize = 500;
  let updated = 0;
  let scanned = 0;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) break;

    for (const row of rows as Record<string, unknown>[]) {
      scanned++;
      const id = String(row[idColumn] ?? "");
      const patch: Record<string, unknown> = {};

      const nextTotal = normalizeGuestTotalForStorage(
        row.guest_total as string | null | undefined
      );
      const prevTotal = (row.guest_total as string | null | undefined) ?? null;
      if (nextTotal !== prevTotal) patch.guest_total = nextTotal;

      if (withBreakdown) {
        for (const key of GUEST_BREAKDOWN_KEYS) {
          const prev = (row[key] as string | null | undefined) ?? null;
          const next = normalizeGuestBreakdownForStorage(prev);
          if (next !== prev) patch[key] = next;
        }
      }

      if (!Object.keys(patch).length) continue;
      patch.updated_at = new Date().toISOString();
      const { error: upError } = await supabase
        .from(table)
        .update(patch)
        .eq(idColumn, id);
      if (upError) throw upError;
      updated++;
      console.log(`  ${table} ${id}: ${JSON.stringify(patch)}`);
    }
    if (rows.length < pageSize) break;
  }

  return { scanned, updated };
}

async function migrateLinkedStatus(
  supabase: ReturnType<typeof createAdminClient>
) {
  const { data, error } = await supabase
    .from("reservation_requests")
    .select("request_id,status,linked_reservation_id")
    .eq("status", "本予約連携済");
  if (error) throw error;
  let n = 0;
  for (const row of data ?? []) {
    const { error: upError } = await supabase
      .from("reservation_requests")
      .update({
        status: "承認済",
        updated_at: new Date().toISOString(),
      })
      .eq("request_id", row.request_id);
    if (upError) throw upError;
    n++;
    console.log(
      `  status ${row.request_id}: 本予約連携済 → 承認済 (linked=${row.linked_reservation_id ?? "null"})`
    );
  }
  return n;
}

async function main() {
  const supabase = createAdminClient();
  console.log("=== guest_total 正規化 ===");
  const r1 = await backfillTable(supabase, "reservations", "reservation_id", true);
  console.log(`reservations scanned=${r1.scanned} updated=${r1.updated}`);
  const r2 = await backfillTable(
    supabase,
    "reservation_requests",
    "request_id",
    false
  );
  console.log(`requests scanned=${r2.scanned} updated=${r2.updated}`);

  console.log("\n=== 本予約連携済 → 承認済 ===");
  const migrated = await migrateLinkedStatus(supabase);
  console.log(`migrated=${migrated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
