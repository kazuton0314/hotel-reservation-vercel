import { createClient } from "@/lib/supabase/server";

export type CompanionItem = {
  id: string;
  entry_no: number;
  name: string;
  name_kana: string | null;
  age: string | null;
  gender: string | null;
  source: string;
  answered_at: string;
};

export async function getCompanionsByReservationId(reservationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companions")
    .select(
      "id, entry_no, name, name_kana, age, gender, source, answered_at"
    )
    .eq("reservation_id", reservationId)
    .order("entry_no", { ascending: true });

  return {
    companions: (data ?? []) as CompanionItem[],
    error: error?.message ?? null,
  };
}
