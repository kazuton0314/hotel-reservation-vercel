import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import {
  isGCalConfigured,
  syncReservationToGCal,
} from "@/lib/services/gcal-sync";

loadEnvLocal();

/** キャンセル済み予約を GCal から除去（取り残し掃除） */
async function main() {
  if (!isGCalConfigured()) {
    console.error("GCal 未設定");
    process.exit(1);
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("reservation_id, representative_name, check_in, gcal_event_id")
    .eq("status", "キャンセル");
  if (error) throw error;

  let ok = 0;
  const errors: string[] = [];
  for (const row of data ?? []) {
    const result = await syncReservationToGCal(supabase, row.reservation_id);
    console.log(
      `${row.reservation_id} ${row.representative_name} ${row.check_in} wasGcal=${row.gcal_event_id ?? "null"} ->`,
      result
    );
    if (result.ok) ok++;
    if (result.error) errors.push(`${row.reservation_id}: ${result.error}`);
  }
  console.log(`done ok=${ok} errors=${errors.length}`);
  for (const e of errors) console.log(`  - ${e}`);
  if (errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
