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

/**
 * 内訳が「意味のある人数」を持つか。
 * 部屋割ボードからの割当は未入力内訳を 0 で保存するため、
 * `!= null` だとゼロ埋めを内訳ありと誤判定し、assigned_guest_count を無視してしまう。
 */
function assignmentHasBreakdown(row: AssignmentCountRow): boolean {
  return (
    n(row.male_count) +
      n(row.female_count) +
      n(row.boy_student_count) +
      n(row.girl_student_count) +
      n(row.age_3plus_count) +
      n(row.under_3_count) >
    0
  );
}

/**
 * 部屋1行の割当人数（合計判定用）。
 * 3歳未満(+N)は合計に含めない。内訳合計が 0 のときは assigned_guest_count にフォールバック。
 */
export function assignmentRowGuestSum(row: AssignmentCountRow): number {
  if (assignmentHasBreakdown(row)) {
    return (
      n(row.male_count) +
      n(row.female_count) +
      n(row.boy_student_count) +
      n(row.girl_student_count) +
      n(row.age_3plus_count)
    );
  }
  return n(row.assigned_guest_count);
}

export function assignmentRowUnder3Sum(row: AssignmentCountRow): number {
  return n(row.under_3_count);
}

/**
 * 宿泊人数と部屋割内訳が一致しているときだけ割当済（一覧「部屋割→未割当」用）。
 * 3歳未満は判定に使わない。部屋が無い／人数不足／人数超過は未割当。
 * 部屋割ボードの未割当列は「部屋なし」のみ（room-occupancy 側）で判定する。
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
 *
 * アーカイブ予約は日次処理で部屋割行も is_archived=true になるため、
 * アクティブ行だけ見ると常に「未割当」へ落ちる。予約の archive 状態に合わせて
 * 集計対象の部屋割を切り替える。
 */
export async function syncAssignmentStatus(
  supabase: SupabaseClient,
  reservationId: string
): Promise<string> {
  const { data: reservation } = await supabase
    .from("reservations")
    .select("guest_total, is_archived")
    .eq("reservation_id", reservationId)
    .maybeSingle();

  let assignmentQuery = supabase
    .from("room_assignments")
    .select(
      "assigned_guest_count, male_count, female_count, boy_student_count, girl_student_count, age_3plus_count, under_3_count"
    )
    .eq("reservation_id", reservationId);

  // アクティブ予約は現行の部屋割のみ。アーカイブ予約は履歴行を含めて判定。
  if (!reservation?.is_archived) {
    assignmentQuery = assignmentQuery.eq("is_archived", false);
  }

  const { data: assignments } = await assignmentQuery;

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
