import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import {
  findReservationForCompanionAccessKey,
} from "@/lib/services/companion-access";

loadEnvLocal();

function argValue(flag: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return "";
  return String(process.argv[idx + 1] ?? "").trim();
}

async function main() {
  const key = argValue("--key");
  const name = argValue("--name");
  if (!key && !name) {
    console.error("Usage: npx tsx scripts/diagnose-companion-link.ts --key TD4X-R2ZB");
    console.error("   or: npx tsx scripts/diagnose-companion-link.ts --name 市川");
    process.exit(1);
  }

  const supabase = createAdminClient();

  if (key) {
    console.log(`\n=== access_key: ${key} ===\n`);

    const { data: resRows } = await supabase
      .from("reservations")
      .select(
        "reservation_id, access_key, representative_name, last_name, first_name, status, is_archived, check_in, check_out"
      )
      .eq("access_key", key);
    console.log("reservations (direct):", resRows ?? []);

    const { data: reqRows } = await supabase
      .from("reservation_requests")
      .select(
        "request_id, access_key, linked_reservation_id, representative_name, last_name, first_name, status, is_archived, check_in, check_out"
      )
      .eq("access_key", key);
    console.log("reservation_requests:", reqRows ?? []);

    const { data: companionRows } = await supabase
      .from("companions")
      .select("reservation_id, access_key, name, entry_no")
      .eq("access_key", key);
    console.log("companions:", companionRows ?? []);

    const resolved = await findReservationForCompanionAccessKey(supabase, key);
    console.log("\nresolved for companion form:", resolved);
    return;
  }

  const like = `%${name}%`;
  const { data: byNameRes } = await supabase
    .from("reservations")
    .select(
      "reservation_id, access_key, representative_name, last_name, first_name, status, is_archived, check_in, check_out"
    )
    .or(
      `representative_name.ilike.${like},last_name.ilike.${like},first_name.ilike.${like}`
    );
  console.log("\nreservations by name:", byNameRes ?? []);

  const { data: byNameReq } = await supabase
    .from("reservation_requests")
    .select(
      "request_id, access_key, linked_reservation_id, representative_name, last_name, first_name, status, is_archived, check_in, check_out"
    )
    .or(
      `representative_name.ilike.${like},last_name.ilike.${like},first_name.ilike.${like}`
    );
  console.log("reservation_requests by name:", byNameReq ?? []);

  for (const row of byNameRes ?? []) {
    const currentKey = String(row.access_key ?? "").trim();
    if (!currentKey) {
      console.log(`\n⚠ ${row.reservation_id} has no access_key on reservation`);
      continue;
    }
    const resolved = await findReservationForCompanionAccessKey(
      supabase,
      currentKey
    );
    console.log(`\nkey ${currentKey} resolves:`, resolved?.reservation_id ?? "null");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
