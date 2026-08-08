import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULTS } from "@/lib/config/forms";
import { parseGuestCountFromText } from "@/lib/utils/guest-display";

const ASSIGNED = "割当済";
const UNASSIGNED = DEFAULTS.assignmentStatus;

type AssignmentCountRow = {
  assigned_guest_count: number | null;
  male_count: number | null;
  female_count: number | null;
  boy_student_count: number | null;
  girl_student_count: number | null;
  age_3plus_count: number | null;
  under_3_count: number | null;
};

function n(value: number | null | undefined): number {
  return Number(value) || 0;
}

/** 部屋1行の割当人数（内訳優先、なければ assigned_guest_count） */
export function assignmentRowGuestSum(row: AssignmentCountRow): number {
  const breakdown =
    n(row.male_count) +
    n(row.female_count) +
    n(row.boy_student_count) +
    n(row.girl_student_count) +
    n(row.age_3plus_count) +
    n(row.under_3_count);
  if (breakdown > 0) return breakdown;
  return n(row.assigned_guest_count);
}

/**
 * 宿泊人数と部屋割内訳が一致しているときだけ割当済。
 * 部屋が無い／人数不足／人数超過はすべて未割当（一覧フィルタに載せる）。
 */
export function isRoomAssignmentComplete(
  guestTotal: string | null | undefined,
  assignments: AssignmentCountRow[]
): boolean {
  if (!assignments.length) return false;
  const target = parseGuestCountFromText(guestTotal);
  if (target <= 0) return false;
  const assigned = assignments.reduce(
    (sum, row) => sum + assignmentRowGuestSum(row),
    0
  );
  return assigned === target;
}

/**
 * assignment_status は room_assignments + 宿泊人数からの派生キャッシュ。
 * 割当 CRUD・宿泊人数変更のたびに呼ぶ。直接書き込まず、ここに同期させる。
 */
export async function syncAssignmentStatus(
  supabase: SupabaseClient,
  reservationId: string
): Promise<string> {
  const [{ data: reservation }, { data: assignments }] = await Promise.all([
    supabase
      .from("reservations")
      .select("guest_total")
      .eq("reservation_id", reservationId)
      .maybeSingle(),
    supabase
      .from("room_assignments")
      .select(
        "assigned_guest_count, male_count, female_count, boy_student_count, girl_student_count, age_3plus_count, under_3_count"
      )
      .eq("reservation_id", reservationId)
      .eq("is_archived", false),
  ]);

  const status = isRoomAssignmentComplete(
    reservation?.guest_total,
    (assignments ?? []) as AssignmentCountRow[]
  )
    ? ASSIGNED
    : UNASSIGNED;

  await supabase
    .from("reservations")
    .update({
      assignment_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("reservation_id", reservationId);

  return status;
}
