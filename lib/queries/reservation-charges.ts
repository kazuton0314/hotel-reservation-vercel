import { createReadClient } from "@/lib/supabase/read";

export type ReservationChargeItem = {
  id: string;
  reservation_id: string;
  category: string;
  label: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
  source: string;
  sort_order: number;
};

export async function getReservationCharges(reservationId: string) {
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("reservation_charges")
    .select(
      "id, reservation_id, category, label, unit_price, quantity, subtotal, source, sort_order"
    )
    .eq("reservation_id", reservationId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    const message = error.message ?? "";
    if (/reservation_charges/i.test(message) && /schema cache|does not exist/i.test(message)) {
      return { charges: [] as ReservationChargeItem[], error: null, tableMissing: true };
    }
    return { charges: [] as ReservationChargeItem[], error: message, tableMissing: false };
  }

  return {
    charges: (data ?? []).map((row) => ({
      ...row,
      unit_price: Number(row.unit_price ?? 0),
      quantity: Number(row.quantity ?? 0),
      subtotal: Number(row.subtotal ?? 0),
    })) as ReservationChargeItem[],
    error: null,
    tableMissing: false,
  };
}
