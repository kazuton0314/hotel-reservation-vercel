/**
 * キャンセル済み予約に残った部屋割を削除
 * npx tsx scripts/cleanup-cancelled-room-assignments.ts
 * npx tsx scripts/cleanup-cancelled-room-assignments.ts --execute
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env";
import { syncAssignmentStatus } from "../lib/services/assignment-status";

loadEnvLocal();

const execute = process.argv.includes("--execute");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: rows, error } = await supabase
    .from("room_assignments")
    .select(
      "room_assignment_id, reservation_id, room_name, stay_start, stay_end, reservations!inner(representative_name, status, is_archived)"
    )
    .eq("is_archived", false);

  if (error) {
    console.error(error);
    process.exit(1);
  }

  type Row = {
    room_assignment_id: string;
    reservation_id: string;
    room_name: string | null;
    stay_start: string;
    stay_end: string;
    reservations:
      | { representative_name: string | null; status: string; is_archived: boolean }
      | { representative_name: string | null; status: string; is_archived: boolean }[];
  };

  const stale = (rows as Row[] | null ?? []).filter((r) => {
    const res = Array.isArray(r.reservations) ? r.reservations[0] : r.reservations;
    if (!res) return false;
    return (
      res.is_archived ||
      res.status === "キャンセル" ||
      res.status === "不可"
    );
  });

  console.log(`Stale assignments on inactive reservations: ${stale.length}`);
  for (const r of stale) {
    const res = Array.isArray(r.reservations) ? r.reservations[0] : r.reservations;
    console.log(
      `  ${r.room_assignment_id} | ${res?.representative_name} | ${res?.status} | ${r.room_name} ${r.stay_start}–${r.stay_end}`
    );
  }

  if (!execute) {
    console.log("\nDry run. Pass --execute to delete.");
    return;
  }

  const byReservation = new Map<string, string[]>();
  for (const r of stale) {
    const list = byReservation.get(r.reservation_id) ?? [];
    list.push(r.room_assignment_id);
    byReservation.set(r.reservation_id, list);
  }

  for (const [reservationId, ids] of byReservation) {
    const { error: delError } = await supabase
      .from("room_assignments")
      .delete()
      .in("room_assignment_id", ids);
    if (delError) {
      console.error(`Failed ${reservationId}:`, delError.message);
      continue;
    }
    await syncAssignmentStatus(supabase, reservationId);
    console.log(`Deleted ${ids.length} for ${reservationId}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
