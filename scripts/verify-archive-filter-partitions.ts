import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { todayIso, businessToday } from "../lib/utils/date-label";
import {
  applyReservationListFilter,
  UNASSIGNED_ROOM_FILTER,
  ASSIGNED_ROOM_FILTER,
} from "../lib/services/reservation-list-filter";
import { buildReservationListFilterFields } from "../lib/list/reservation-filter-fields";
import { buildRequestListFilterFields } from "../lib/list/request-filter-fields";
import { applyRequestListFilter } from "../lib/services/request-list-filter";
import { effectiveGuestCountForCompanion } from "../lib/utils/guest-display";
import { reservationHasActiveConfirmationTask } from "../lib/services/reservation-active-tasks";
import { reservationNeedsCompanionInfo } from "../lib/services/mail-pending";
import { isRoomAssignmentComplete } from "../lib/services/assignment-status";
import { displayRequestStatus } from "../lib/domain/request-status";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing env");
  const sb = createClient(url, key);
  const iso = todayIso();
  const ref = businessToday();
  console.log("today", iso);

  const { data: rooms } = await sb
    .from("rooms")
    .select("room_id, room_name")
    .eq("is_active", true);
  const { data: allRes } = await sb.from("reservations").select(
    "reservation_id, representative_name, status, check_in, check_out, guest_total, assignment_status, channel, meal, bbq, somen, payment_status, companion_form_answered, completion_email_sent, day11_email_sent, day3_email_sent, email, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3, created_at, sheet_created_at, is_archived"
  );

  // 一覧アーカイブと同じ: is_archived OR check_out < today
  const archiveRes = (allRes ?? []).filter(
    (r) => r.is_archived === true || (r.check_out != null && r.check_out < iso)
  );
  console.log("archive reservations (all statuses)", archiveRes.length);
  for (const s of ["確定", "仮予約", "キャンセル"]) {
    console.log("  ", s, archiveRes.filter((r) => r.status === s).length);
  }

  const { data: assignsActive } = await sb
    .from("room_assignments")
    .select(
      "room_assignment_id, reservation_id, room_id, room_name, assigned_guest_count, male_count, female_count, boy_student_count, girl_student_count, age_3plus_count, under_3_count, is_archived"
    )
    .eq("is_archived", false);
  const { data: assignsArchived } = await sb
    .from("room_assignments")
    .select(
      "room_assignment_id, reservation_id, room_id, room_name, assigned_guest_count, male_count, female_count, boy_student_count, girl_student_count, age_3plus_count, under_3_count, is_archived"
    )
    .eq("is_archived", true);

  // archive scope: includeArchivedAssignments=true → 全割当行
  const byResAll = new Map<
    string,
    NonNullable<typeof assignsActive>
  >();
  for (const a of [...(assignsActive ?? []), ...(assignsArchived ?? [])]) {
    const list = byResAll.get(a.reservation_id) ?? [];
    list.push(a);
    byResAll.set(a.reservation_id, list);
  }

  const itemsAll = archiveRes.map((row) => {
    const assignments = byResAll.get(row.reservation_id) ?? [];
    const companion_required = effectiveGuestCountForCompanion(row) >= 2;
    return {
      ...row,
      assignments,
      companion_required,
      companion_pending: reservationNeedsCompanionInfo(row as never, ref),
      any_mail_pending: reservationHasActiveConfirmationTask(row as never, ref),
      assignment_status: isRoomAssignmentComplete(row.guest_total, assignments)
        ? "割当済"
        : "未割当",
    };
  });

  const fields = buildReservationListFilterFields(rooms ?? []);
  const errors: string[] = [];

  function check(label: string, population: typeof itemsAll) {
    const total = population.length;
    console.log(`\n======== ${label} n=${total} ========`);
    for (const field of fields) {
      const counts = field.options.map((opt) => ({
        label: opt.label,
        value: opt.value,
        n: applyReservationListFilter(population as never, field.key, opt.value)
          .length,
        ids: applyReservationListFilter(
          population as never,
          field.key,
          opt.value
        ).map((r) => r.reservation_id),
      }));
      let sum: number;
      let mode: string;
      if (field.key === "roomId") {
        const un =
          counts.find((c) => c.value === UNASSIGNED_ROOM_FILTER)?.n ?? 0;
        const asg =
          counts.find((c) => c.value === ASSIGNED_ROOM_FILTER)?.n ?? 0;
        sum = un + asg;
        mode = `未割当+割当済=${un}+${asg}`;
      } else {
        sum = counts.reduce((s, c) => s + c.n, 0);
        mode = "all";
      }
      const ok = sum === total;
      console.log(
        `[${field.label}] sum(${mode})=${sum} ${ok ? "OK" : "FAIL"}`
      );
      for (const c of counts) {
        if (
          field.key === "roomId" &&
          c.value !== UNASSIGNED_ROOM_FILTER &&
          c.value !== ASSIGNED_ROOM_FILTER
        ) {
          continue;
        }
        console.log(`  ${c.label}: ${c.n}`);
      }
      if (!ok) errors.push(`${label} ${field.key}: ${sum} != ${total}`);

      if (field.key !== "roomId") {
        const sets = counts.map((c) => new Set(c.ids));
        for (let i = 0; i < sets.length; i++) {
          for (let j = i + 1; j < sets.length; j++) {
            for (const id of sets[i]!) {
              if (sets[j]!.has(id)) {
                errors.push(
                  `${label} ${field.key}: overlap ${counts[i]!.label} ∩ ${counts[j]!.label} (${id})`
                );
              }
            }
          }
        }
      }
    }
  }

  check("アーカイブ全体", itemsAll);
  check(
    "アーカイブ・確定",
    itemsAll.filter((r) => r.status === "確定")
  );
  check(
    "アーカイブ・仮予約",
    itemsAll.filter((r) => r.status === "仮予約")
  );
  check(
    "アーカイブ・キャンセル",
    itemsAll.filter((r) => r.status === "キャンセル")
  );

  const { data: allReq } = await sb
    .from("reservation_requests")
    .select("request_id, status, reply_email_sent, is_archived, check_out");
  const archiveReq = (allReq ?? [])
    .filter(
      (r) => r.is_archived === true || (r.check_out != null && r.check_out < iso)
    )
    .map((r) => ({
      ...r,
      status: displayRequestStatus(r.status),
    }));

  console.log(`\n======== アーカイブ リクエスト n=${archiveReq.length} ========`);
  const reqFields = buildRequestListFilterFields();
  for (const status of [null, "リクエスト", "承認済", "却下"] as const) {
    const pop = status
      ? archiveReq.filter((r) => r.status === status)
      : archiveReq;
    const total = pop.length;
    for (const field of reqFields) {
      const counts = field.options.map((opt) => ({
        label: opt.label,
        n: applyRequestListFilter(pop as never, field.key, opt.value).length,
      }));
      const sum = counts.reduce((s, c) => s + c.n, 0);
      const ok = sum === total;
      console.log(
        `[req ${status ?? "ALL"}/${field.label}] n=${total} sum=${sum} ${ok ? "OK" : "FAIL"}`
      );
      for (const c of counts) console.log(`  ${c.label}: ${c.n}`);
      if (!ok) errors.push(`req ${status} ${field.key}: ${sum} != ${total}`);
    }
  }

  if (errors.length) {
    console.error("\nERRORS:\n" + errors.join("\n"));
    process.exit(1);
  }
  console.log("\nALL ARCHIVE PARTITION CHECKS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
