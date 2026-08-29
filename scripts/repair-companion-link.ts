import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import { resolvePreservedAccessKey } from "@/lib/utils/access-key";

loadEnvLocal();

function argValue(flag: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return "";
  return String(process.argv[idx + 1] ?? "").trim();
}

async function main() {
  const key = argValue("--key");
  const reservationId = argValue("--reservation-id");
  const name = argValue("--name");
  const dryRun = process.argv.includes("--dry-run");

  if (!key) {
    console.error(
      "Usage: npx tsx scripts/repair-companion-link.ts --key TD4X-R2ZB [--reservation-id STUDIO-MT99 | --name 市川]"
    );
    process.exit(1);
  }

  const supabase = createAdminClient();
  let targetId = reservationId;

  if (!targetId && name) {
    const like = `%${name}%`;
    const { data, error } = await supabase
      .from("reservations")
      .select("reservation_id, representative_name, last_name, first_name, access_key, is_archived, status")
      .eq("is_archived", false)
      .or(
        `representative_name.ilike.${like},last_name.ilike.${like},first_name.ilike.${like}`
      )
      .order("check_in", { ascending: false })
      .limit(5);
    if (error) throw error;
    if (!data?.length) {
      console.error("No active reservation matched name:", name);
      process.exit(1);
    }
    if (data.length > 1) {
      console.log("Multiple matches — specify --reservation-id:");
      console.table(data);
      process.exit(1);
    }
    targetId = data[0].reservation_id;
    console.log("Matched reservation:", data[0]);
  }

  if (!targetId) {
    const { data: req } = await supabase
      .from("reservation_requests")
      .select("request_id, linked_reservation_id, representative_name, access_key")
      .eq("access_key", key)
      .maybeSingle();
    if (req?.linked_reservation_id) {
      targetId = String(req.linked_reservation_id);
      console.log("Resolved via request:", req);
    }
  }

  if (!targetId) {
    console.error("Could not resolve reservation. Pass --reservation-id or --name.");
    process.exit(1);
  }

  const { data: reservation, error: loadError } = await supabase
    .from("reservations")
    .select("reservation_id, access_key, representative_name, status, is_archived")
    .eq("reservation_id", targetId)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!reservation) {
    console.error("Reservation not found:", targetId);
    process.exit(1);
  }
  if (reservation.is_archived) {
    console.error("Reservation is archived:", targetId);
    process.exit(1);
  }

  const currentKey = String(reservation.access_key ?? "").trim();
  if (currentKey === key) {
    console.log("Already OK:", targetId, key);
    return;
  }

  const { data: keyOwner } = await supabase
    .from("reservations")
    .select("reservation_id, representative_name")
    .eq("access_key", key)
    .neq("reservation_id", targetId)
    .maybeSingle();
  if (keyOwner) {
    console.error("Key already used by another reservation:", keyOwner);
    process.exit(1);
  }

  const nextKey = resolvePreservedAccessKey(currentKey, key);
  if (currentKey && nextKey !== key) {
    console.error(
      `Refusing to replace existing key ${currentKey} on ${targetId}. Use --dry-run to inspect only.`
    );
    process.exit(1);
  }

  console.log(`${dryRun ? "[dry-run] " : ""}Set ${targetId}.access_key = ${key}`);
  if (dryRun) return;

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("reservations")
    .update({ access_key: key, updated_at: nowIso })
    .eq("reservation_id", targetId);
  if (updateError) throw updateError;

  const { data: reqLinked } = await supabase
    .from("reservation_requests")
    .select("request_id, access_key")
    .eq("linked_reservation_id", targetId);
  for (const req of reqLinked ?? []) {
    if (String(req.access_key ?? "").trim() === key) continue;
    await supabase
      .from("reservation_requests")
      .update({ access_key: key, updated_at: nowIso })
      .eq("request_id", req.request_id);
  }

  console.log("Done. Companion URL should work for key:", key);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
