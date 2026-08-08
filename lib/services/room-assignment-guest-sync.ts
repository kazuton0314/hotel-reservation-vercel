import type { SupabaseClient } from "@supabase/supabase-js";

function parseCount(value: unknown): number | null {
  const s = String(value ?? "").trim();
  if (!s || !/^\d+$/.test(s)) return null;
  return Number(s);
}

/**
 * 予約台帳の人数内訳を紐づく部屋割行へ同期。
 * 部屋が複数あるときは部屋ごとの内訳を壊さないよう同期しない。
 * （1部屋＝全員割当のときだけ台帳→部屋割へ反映）
 */
export async function syncRoomAssignmentGuestBreakdown(
  supabase: SupabaseClient,
  reservationId: string,
  guestFields: {
    adult_male?: unknown;
    adult_female?: unknown;
    boy_student?: unknown;
    girl_student?: unknown;
    age_3plus?: unknown;
    under_3?: unknown;
  }
) {
  const { data: assignments } = await supabase
    .from("room_assignments")
    .select("room_assignment_id")
    .eq("reservation_id", reservationId)
    .eq("is_archived", false);

  if (!assignments?.length || assignments.length > 1) return;

  const male = parseCount(guestFields.adult_male) ?? 0;
  const female = parseCount(guestFields.adult_female) ?? 0;
  const boy = parseCount(guestFields.boy_student) ?? 0;
  const girl = parseCount(guestFields.girl_student) ?? 0;
  const age3 = parseCount(guestFields.age_3plus) ?? 0;
  const under3 = parseCount(guestFields.under_3) ?? 0;

  const patch = {
    male_count: male,
    female_count: female,
    boy_student_count: boy,
    girl_student_count: girl,
    age_3plus_count: age3,
    under_3_count: under3,
    child_count: boy + girl + age3 + under3,
    assigned_guest_count: male + female + boy + girl + age3 + under3,
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("room_assignments")
    .update(patch)
    .eq("reservation_id", reservationId)
    .eq("is_archived", false);
}
