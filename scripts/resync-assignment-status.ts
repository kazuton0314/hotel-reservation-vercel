/**
 * assignment_status を人数一致ルールで再同期する。
 * 部屋なし／人数不足／人数超過 → 未割当、人数一致 → 割当済。
 *
 * Dry run: npx tsx scripts/resync-assignment-status.ts
 * Execute: npx tsx scripts/resync-assignment-status.ts --execute
 */
import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import {
  isRoomAssignmentComplete,
  syncAssignmentStatus,
} from "@/lib/services/assignment-status";

loadEnvLocal();

async function main() {
  const execute = process.argv.includes("--execute");
  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from("reservations")
    .select(
      "reservation_id, representative_name, assignment_status, guest_total, status"
    )
    .eq("is_archived", false)
    .in("status", ["仮予約", "確定"]);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const ids = (rows ?? []).map((r) => r.reservation_id);
  const { data: assignments, error: assignError } = await supabase
    .from("room_assignments")
    .select(
      "reservation_id, assigned_guest_count, male_count, female_count, boy_student_count, girl_student_count, age_3plus_count, under_3_count"
    )
    .in("reservation_id", ids.length ? ids : ["__none__"])
    .eq("is_archived", false);

  if (assignError) {
    console.error(assignError.message);
    process.exit(1);
  }

  const byReservation = new Map<string, NonNullable<typeof assignments>>();
  for (const a of assignments ?? []) {
    const list = byReservation.get(a.reservation_id) ?? [];
    list.push(a);
    byReservation.set(a.reservation_id, list);
  }

  let wouldChange = 0;
  let changed = 0;
  for (const r of rows ?? []) {
    const rooms = byReservation.get(r.reservation_id) ?? [];
    const next = isRoomAssignmentComplete(r.guest_total, rooms)
      ? "割当済"
      : "未割当";
    if (next === r.assignment_status) continue;
    wouldChange++;
    console.log(
      `${r.reservation_id} | ${r.representative_name} | ${r.assignment_status} → ${next} | guest=${r.guest_total} rooms=${rooms.length}`
    );
    if (execute) {
      await syncAssignmentStatus(supabase, r.reservation_id);
      changed++;
    }
  }

  if (!execute) {
    console.log(
      `\nDry run: ${wouldChange} / ${(rows ?? []).length} would change. Re-run with --execute to apply.`
    );
    return;
  }

  console.log(`\nUpdated ${changed} / ${(rows ?? []).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
