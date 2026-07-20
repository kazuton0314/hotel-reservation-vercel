import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import { isGCalConfigured } from "@/lib/services/gcal-sync";

loadEnvLocal();

async function main() {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("reservations")
    .select(
      "reservation_id,representative_name,status,check_in,check_out,gcal_event_id,updated_at"
    )
    .eq("status", "キャンセル")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const withGcal = rows.filter((r) => r.gcal_event_id);
  console.log("gcal configured:", isGCalConfigured());
  console.log("cancelled total:", rows.length);
  console.log("cancelled WITH gcal_event_id:", withGcal.length);
  for (const r of withGcal) {
    console.log(
      `  ${r.reservation_id} ${r.representative_name} ${r.check_in} gcal=${r.gcal_event_id}`
    );
  }
  console.log("\nrecent cancelled:");
  for (const r of rows.slice(0, 20)) {
    console.log(
      `${r.reservation_id} ${r.representative_name} ${r.check_in} gcal=${r.gcal_event_id ?? "null"} upd=${r.updated_at}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
