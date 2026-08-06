/**
 * 部屋割の整合性監査
 * npx tsx scripts/audit-room-assignments.ts
 * npx tsx scripts/audit-room-assignments.ts --date 2025-08-13 --room 高学年
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env";

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(url, key);

function parseArgs() {
  const args = process.argv.slice(2);
  let date: string | null = null;
  let roomName: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) date = args[++i];
    if (args[i] === "--room" && args[i + 1]) roomName = args[++i];
  }
  return { date, roomName };
}

function datesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

type Row = {
  room_assignment_id: string;
  reservation_id: string;
  room_id: string | null;
  room_name: string | null;
  stay_start: string;
  stay_end: string;
  is_archived: boolean;
  updated_at: string | null;
  representative_name?: string | null;
  status?: string | null;
  check_in?: string | null;
  check_out?: string | null;
};

async function main() {
  const { date, roomName } = parseArgs();

  const { data: rooms } = await supabase
    .from("rooms")
    .select("room_id, room_name")
    .order("sort_order");
  console.log("Rooms:", (rooms ?? []).map((r) => `${r.room_id}: ${r.room_name}`).join(", "));

  const query = supabase
    .from("room_assignments")
    .select(
      "room_assignment_id, reservation_id, room_id, room_name, stay_start, stay_end, is_archived, updated_at"
    )
    .eq("is_archived", false)
    .order("stay_start");

  const { data: assignments, error } = await query;
  if (error) {
    console.error(error);
    process.exit(1);
  }

  const resIds = [...new Set((assignments ?? []).map((a) => a.reservation_id))];
  const { data: reservations } = await supabase
    .from("reservations")
    .select("reservation_id, representative_name, status, check_in, check_out")
    .in("reservation_id", resIds.length ? resIds : ["__none__"]);

  const resMap = new Map((reservations ?? []).map((r) => [r.reservation_id, r]));

  const rows: Row[] = (assignments ?? []).map((a) => ({
    ...a,
    ...resMap.get(a.reservation_id),
  }));

  // 1) Duplicate same reservation + room + dates
  console.log("\n=== Duplicate assignments (same res+room+stay) ===");
  const dupKey = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.reservation_id}|${r.room_id}|${r.stay_start}|${r.stay_end}`;
    const list = dupKey.get(k) ?? [];
    list.push(r);
    dupKey.set(k, list);
  }
  let dupCount = 0;
  for (const [k, list] of dupKey) {
    if (list.length > 1) {
      dupCount++;
      console.log(`\n[${list.length}x] ${k}`);
      for (const r of list) {
        console.log(
          `  ${r.room_assignment_id} | ${r.representative_name} | ${r.status} | updated ${r.updated_at}`
        );
      }
    }
  }
  if (!dupCount) console.log("(none)");

  // 2) Cross-reservation overlaps per room
  console.log("\n=== Cross-reservation overlaps (same room, overlapping stay) ===");
  const byRoom = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.room_id) continue;
    const list = byRoom.get(r.room_id) ?? [];
    list.push(r);
    byRoom.set(r.room_id, list);
  }
  let overlapCount = 0;
  for (const [roomId, list] of byRoom) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.reservation_id === b.reservation_id) continue;
        if (
          datesOverlap(a.stay_start, a.stay_end, b.stay_start, b.stay_end)
        ) {
          overlapCount++;
          const roomLabel =
            rooms?.find((rm) => rm.room_id === roomId)?.room_name ?? roomId;
          console.log(
            `\n${roomLabel}: ${a.representative_name} (${a.reservation_id}) ${a.stay_start}–${a.stay_end}`
          );
          console.log(
            `  vs ${b.representative_name} (${b.reservation_id}) ${b.stay_start}–${b.stay_end}`
          );
          console.log(
            `  RA: ${a.room_assignment_id} / ${b.room_assignment_id}`
          );
        }
      }
    }
  }
  if (!overlapCount) console.log("(none)");

  // 3) Assignment vs reservation CI/CO mismatch
  console.log("\n=== Stay dates outside reservation CI/CO ===");
  let mismatchCount = 0;
  for (const r of rows) {
    if (!r.check_in || !r.check_out) continue;
    if (r.stay_start < r.check_in || r.stay_end > r.check_out) {
      mismatchCount++;
      console.log(
        `${r.room_assignment_id} | ${r.representative_name} | RA ${r.stay_start}–${r.stay_end} vs res ${r.check_in}–${r.check_out} | ${r.room_name}`
      );
    }
  }
  if (!mismatchCount) console.log("(none)");

  // 4) Orphan / cancelled reservations with active assignments
  console.log("\n=== Assignments on cancelled/archived reservations ===");
  let badRes = 0;
  for (const r of rows) {
    if (r.status === "キャンセル" || r.status === "不可") {
      badRes++;
      console.log(
        `${r.room_assignment_id} | ${r.representative_name} | ${r.status} | ${r.room_name} ${r.stay_start}–${r.stay_end}`
      );
    }
  }
  if (!badRes) console.log("(none)");

  // 5) assignment_status vs actual count
  console.log("\n=== assignment_status mismatch ===");
  const { data: allRes } = await supabase
    .from("reservations")
    .select("reservation_id, representative_name, status, assignment_status, check_in, check_out")
    .eq("is_archived", false)
    .in("status", ["仮予約", "確定"]);

  const assignCount = new Map<string, number>();
  for (const r of rows) {
    assignCount.set(
      r.reservation_id,
      (assignCount.get(r.reservation_id) ?? 0) + 1
    );
  }
  let statusMismatch = 0;
  for (const r of allRes ?? []) {
    const n = assignCount.get(r.reservation_id) ?? 0;
    const expected = n > 0 ? "割当済" : "未割当";
    if (r.assignment_status !== expected) {
      statusMismatch++;
      console.log(
        `${r.reservation_id} | ${r.representative_name} | status=${r.assignment_status} actual=${n} (${expected}) | CI ${r.check_in}`
      );
    }
  }
  if (!statusMismatch) console.log("(none)");

  // 6) Targeted date/room filter
  if (date) {
    console.log(`\n=== Assignments covering ${date} ===`);
    const filtered = rows.filter(
      (r) => r.stay_start <= date && r.stay_end > date
    );
    const roomFiltered = roomName
      ? filtered.filter((r) =>
          (r.room_name ?? "").includes(roomName)
        )
      : filtered;
    for (const r of roomFiltered.sort((a, b) =>
      (a.room_name ?? "").localeCompare(b.room_name ?? "")
    )) {
      console.log(
        `${r.room_name} | ${r.representative_name} | ${r.reservation_id} | ${r.stay_start}–${r.stay_end} | RA ${r.room_assignment_id}`
      );
    }
    if (!roomFiltered.length) console.log("(none for filter)");
  }

  console.log(`\nTotal active assignments: ${rows.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
