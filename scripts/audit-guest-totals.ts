import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import {
  classifyGuestTotal,
  hasIndefiniteGuestCount,
} from "@/lib/utils/guest-count-format";

loadEnvLocal();

async function main() {
  const sb = createAdminClient();
  const { data: rows } = await sb
    .from("reservations")
    .select(
      "reservation_id,guest_total,adult_male,adult_female,boy_student,girl_student,age_3plus,under_3,representative_name"
    )
    .eq("is_archived", false);
  const indefinite: string[] = [];
  const definite: string[] = [];
  for (const r of rows ?? []) {
    const c = classifyGuestTotal(r.guest_total);
    const indef = hasIndefiniteGuestCount(r);
    const line = `${r.reservation_id} ${r.representative_name} guest_total=${JSON.stringify(r.guest_total)} kind=${c.kind}`;
    if (indef) indefinite.push(line);
    else definite.push(line);
  }
  console.log(`definite=${definite.length} indefinite=${indefinite.length}`);
  console.log("\n=== 人数不定サンプル ===");
  for (const l of indefinite.slice(0, 25)) console.log(l);

  const { data: statuses } = await sb
    .from("reservation_requests")
    .select("status,linked_reservation_id");
  const by: Record<string, number> = {};
  let linked = 0;
  for (const r of statuses ?? []) {
    by[r.status] = (by[r.status] ?? 0) + 1;
    if (r.linked_reservation_id) linked++;
  }
  console.log("\nrequest status:", by);
  console.log("linked count:", linked);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
