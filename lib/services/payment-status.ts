import type { SupabaseClient } from "@supabase/supabase-js";

type PaymentStatus = "完了" | "未払い";

function positiveNumber(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nightsBetween(checkIn: unknown, checkOut: unknown): number | null {
  const start = Date.parse(`${String(checkIn ?? "").slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${String(checkOut ?? "").slice(0, 10)}T00:00:00Z`);
  const diff = Math.round((end - start) / 86_400_000);
  return Number.isFinite(diff) && diff > 0 ? diff : null;
}

export function calculatePaymentStatus(
  reservation: { guest_total?: unknown; check_in?: unknown; check_out?: unknown; nights?: unknown },
  charges: { category?: unknown; unit_price?: unknown; quantity?: unknown; subtotal?: unknown }[]
): { status: PaymentStatus; expectedGuestNights: number | null; chargedGuestNights: number } {
  const guests = positiveNumber(reservation.guest_total);
  const nights = nightsBetween(reservation.check_in, reservation.check_out) ?? positiveNumber(reservation.nights);
  const expectedGuestNights = guests && nights ? guests * nights : null;
  const lodging = charges.filter((charge) => String(charge.category ?? "") === "宿泊料金");
  const chargedGuestNights = lodging.reduce((sum, charge) => sum + (positiveNumber(charge.quantity) ?? 0), 0);
  const rowsValid = lodging.length > 0 && lodging.every((charge) => {
    const unit = positiveNumber(charge.unit_price);
    const quantity = positiveNumber(charge.quantity);
    const subtotal = positiveNumber(charge.subtotal);
    return unit !== null && quantity !== null && subtotal !== null && Math.round(unit * quantity) === subtotal;
  });
  const complete = rowsValid && expectedGuestNights !== null && chargedGuestNights === expectedGuestNights;
  return { status: complete ? "完了" : "未払い", expectedGuestNights, chargedGuestNights };
}

export async function syncAutomaticPaymentStatus(
  supabase: SupabaseClient,
  reservationId: string,
  options: { force?: boolean } = {}
) {
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("guest_total,check_in,check_out,nights,payment_status_manual_override")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (reservationError) throw reservationError;
  if (!reservation) throw new Error("予約が見つかりません");
  if (reservation.payment_status_manual_override && !options.force) return null;

  const { data: charges, error: chargesError } = await supabase
    .from("reservation_charges")
    .select("category,unit_price,quantity,subtotal")
    .eq("reservation_id", reservationId);
  if (chargesError) throw chargesError;
  const result = calculatePaymentStatus(reservation, charges ?? []);
  const { error: updateError } = await supabase
    .from("reservations")
    .update({ payment_status: result.status, updated_at: new Date().toISOString() })
    .eq("reservation_id", reservationId);
  if (updateError) throw updateError;
  return result;
}
