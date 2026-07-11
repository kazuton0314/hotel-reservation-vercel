import { createReadClient } from "@/lib/supabase/read";

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
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("companions")
    .select(
      "id, entry_no, name, name_kana, age, gender, source, answered_at"
    )
    .eq("reservation_id", reservationId)
    .order("entry_no", { ascending: true });

  if (error) {
    const message = error.message ?? "";
    if (/companions/i.test(message) && /schema cache|does not exist/i.test(message)) {
      return {
        companions: [] as CompanionItem[],
        error: null,
        tableMissing: true,
      };
    }
    return {
      companions: [] as CompanionItem[],
      error: message,
      tableMissing: false,
    };
  }

  return {
    companions: (data ?? []) as CompanionItem[],
    error: null,
    tableMissing: false,
  };
}
