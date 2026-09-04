/**
 * 顧客 backfill 対象抽出の検証（DB は変更しない）
 */
import assert from "node:assert/strict";
import { loadEnvLocal } from "./load-env";
loadEnvLocal();
import { createAdminClient } from "@/lib/supabase/server";
import {
  backfillMissingCustomers,
  listReservationsMissingCustomers,
} from "@/lib/import/backfill-missing-customers";
import { isCustomerIndexable } from "@/lib/services/customer-index";

async function main() {
  const supabase = createAdminClient();

  const studio = await listReservationsMissingCustomers(supabase, {
    importSources: ["STUDIO"],
  });
  for (const c of studio) {
    assert.ok(c.customer_key);
    assert.equal(c.import_source, "STUDIO");
  }

  // dry-run は DB を変えない
  const before = await listReservationsMissingCustomers(supabase, {
    importSources: ["STUDIO"],
  });
  const dry = await backfillMissingCustomers(supabase, {
    dryRun: true,
    importSources: ["STUDIO"],
  });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.linked.length, 0);
  const after = await listReservationsMissingCustomers(supabase, {
    importSources: ["STUDIO"],
  });
  assert.equal(before.length, after.length);
  assert.equal(dry.candidates.length, before.length);

  // 既に customer_id がある行は候補に出ない
  const { data: withCid } = await supabase
    .from("reservations")
    .select("reservation_id, customer_id, email, phone, representative_name")
    .eq("import_source", "STUDIO")
    .not("customer_id", "is", null)
    .limit(5);
  const candidateIds = new Set(studio.map((c) => c.reservation_id));
  for (const row of withCid ?? []) {
    assert.equal(candidateIds.has(String(row.reservation_id)), false);
    assert.ok(String(row.customer_id ?? "").trim());
  }

  // 索引不能な手動予約は STUDIO 候補に混ざらない（型チェック用）
  assert.equal(
    studio.every((c) =>
      isCustomerIndexable({
        representative_name: c.representative_name,
        email: c.email,
        phone: c.phone,
      })
    ),
    true
  );

  console.log("verify-backfill-missing-customers: ok");
  console.log(`STUDIO missing candidates: ${studio.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
