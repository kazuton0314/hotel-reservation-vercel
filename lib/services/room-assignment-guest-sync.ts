import type { SupabaseClient } from "@supabase/supabase-js";

function parseCount(value: unknown): number | null {
  const s = String(value ?? "").trim();
  if (!s || !/^\d+$/.test(s)) return null;
  return Number(s);
}

/** 予約台帳の人数内訳を紐づく部屋割行へ同期（GAS 6.4） */
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

  if (!assignments?.length) return;

  const patch = {
    male_count: parseCount(guestFields.adult_male),
    female_count: parseCount(guestFields.adult_female),
    boy_student_count: parseCount(guestFields.boy_student),
    girl_student_count: parseCount(guestFields.girl_student),
    age_3plus_count: parseCount(guestFields.age_3plus),
    under_3_count: parseCount(guestFields.under_3),
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("room_assignments")
    .update(patch)
    .eq("reservation_id", reservationId)
    .eq("is_archived", false);
}
