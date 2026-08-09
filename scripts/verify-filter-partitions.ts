import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { todayIso, businessToday } from "../lib/utils/date-label";
import {
  applyReservationListFilter,
  UNASSIGNED_ROOM_FILTER,
} from "../lib/services/reservation-list-filter";
import { ASSIGNED_ROOM_FILTER } from "../lib/list/filter-partition";
import { buildReservationListFilterFields } from "../lib/list/reservation-filter-fields";
import { buildRequestListFilterFields } from "../lib/list/request-filter-fields";
import { applyRequestListFilter } from "../lib/services/request-list-filter";
import { effectiveGuestCountForCompanion } from "../lib/utils/guest-display";
import { reservationHasActiveConfirmationTask } from "../lib/services/reservation-active-tasks";
import { reservationNeedsCompanionInfo } from "../lib/services/mail-pending";
import { isRoomAssignmentComplete } from "../lib/services/assignment-status";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing supabase env");

  const sb = createClient(url, key);
  const iso = todayIso();
  const ref = businessToday();
  const { data: rooms } = await sb
    .from("rooms")
    .select("room_id, room_name")
    .eq("is_active", true);
  const { data: res } = await sb
    .from("reservations")
    .select(
      "reservation_id, representative_name, status, check_in, check_out, guest_total, assignment_status, channel, meal, bbq, payment_status, companion_form_answered, completion_email_sent, day11_email_sent, day3_email_sent, email, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3, created_at, sheet_created_at, is_archived"
    )
    .eq("is_archived", false)
    .gte("check_out", iso);
  const { data: assigns } = await sb
    .from("room_assignments")
    .select(
      "room_assignment_id, reservation_id, room_id, room_name, assigned_guest_count, male_count, female_count, boy_student_count, girl_student_count, age_3plus_count, under_3_count"
    )
    .eq("is_archived", false);
  const byRes = new Map<string, NonNullable<typeof assigns>>();
  for (const a of assigns ?? []) {
    const list = byRes.get(a.reservation_id) ?? [];
    list.push(a);
    byRes.set(a.reservation_id, list);
  }

  const items = (res ?? []).map((row) => {
    const assignments = byRes.get(row.reservation_id) ?? [];
    const companion_required = effectiveGuestCountForCompanion(row) >= 2;
    return {
      ...row,
      assignments,
      companion_required,
      companion_form_answered: row.companion_form_answered,
      companion_pending: reservationNeedsCompanionInfo(row as never, ref),
      any_mail_pending: reservationHasActiveConfirmationTask(row as never, ref),
      assignment_status: isRoomAssignmentComplete(row.guest_total, assignments)
        ? "割当済"
        : "未割当",
    };
  });

  // 本予約一覧のデフォルトタブ「確定」と同じ母集団
  const confirmed = items.filter((r) => r.status === "確定");
  const total = confirmed.length;
  const fields = buildReservationListFilterFields(rooms ?? []);
  const errors: string[] = [];

  console.log(`母集団: 確定・これから = ${total}件（全体これから ${items.length}件）`);

  for (const field of fields) {
    const counts = field.options.map((opt) => ({
      label: opt.label,
      value: opt.value,
      n: applyReservationListFilter(confirmed as never, field.key, opt.value)
        .length,
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
      mode = "all options";
    }

    const ok = sum === total;
    console.log(
      `\n[${field.label}] total=${total} sum(${mode})=${sum} ${ok ? "OK" : "FAIL"}`
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
    if (!ok) errors.push(`${field.key}: sum ${sum} != ${total}`);

    if (field.key !== "roomId") {
      const sets = field.options.map(
        (opt) =>
          new Set(
            applyReservationListFilter(
              confirmed as never,
              field.key,
              opt.value
            ).map((r) => r.reservation_id)
          )
      );
      for (let i = 0; i < sets.length; i++) {
        for (let j = i + 1; j < sets.length; j++) {
          for (const id of sets[i]!) {
            if (sets[j]!.has(id)) {
              errors.push(
                `${field.key}: overlap ${field.options[i]!.label} ∩ ${field.options[j]!.label} (${id})`
              );
            }
          }
        }
      }
    }
  }

  const { data: reqs } = await sb
    .from("reservation_requests")
    .select("request_id, status, reply_email_sent, is_archived, check_out")
    .eq("is_archived", false)
    .gte("check_out", iso)
    .eq("status", "リクエスト");
  const requestItems = reqs ?? [];
  const reqTotal = requestItems.length;
  const reqFields = buildRequestListFilterFields();
  for (const field of reqFields) {
    const counts = field.options.map((opt) => ({
      label: opt.label,
      n: applyRequestListFilter(requestItems as never, field.key, opt.value)
        .length,
    }));
    const sum = counts.reduce((s, c) => s + c.n, 0);
    const ok = sum === reqTotal;
    console.log(
      `\n[リクエスト/status=リクエスト/${field.label}] total=${reqTotal} sum=${sum} ${ok ? "OK" : "FAIL"}`
    );
    for (const c of counts) console.log(`  ${c.label}: ${c.n}`);
    if (!ok) errors.push(`request ${field.key}: ${sum} != ${reqTotal}`);
  }

  if (errors.length) {
    console.error("\nERRORS:\n" + errors.join("\n"));
    process.exit(1);
  }
  console.log("\nALL PARTITION CHECKS PASSED (confirmed=44 baseline)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
