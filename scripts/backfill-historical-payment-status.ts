import { loadEnvLocal } from "./load-env";
import { createAdminClient } from "@/lib/supabase/server";
import {
  calculatePaymentStatus,
  syncAutomaticPaymentStatus,
} from "@/lib/services/payment-status";

loadEnvLocal();

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main() {
  const year = arg("--year", process.argv[2]);
  const execute = process.argv.includes("--execute");
  if (!year || !/^\d{4}$/.test(year)) throw new Error("--year YYYY を指定してください");
  const supabase = createAdminClient();
  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("reservation_id,guest_total,check_in,check_out,nights,payment_status_manual_override")
    .eq("import_source", "過去取込")
    .gte("check_in", `${year}-01-01`)
    .lte("check_in", `${year}-12-31`)
    .order("reservation_id");
  if (error) throw error;

  const ids = (reservations ?? []).map((row) => row.reservation_id);
  const { data: charges, error: chargeError } = ids.length
    ? await supabase
        .from("reservation_charges")
        .select("reservation_id,category,unit_price,quantity,subtotal")
        .in("reservation_id", ids)
    : { data: [], error: null };
  if (chargeError) throw chargeError;

  const results = (reservations ?? []).map((reservation) => ({
    reservationId: reservation.reservation_id,
    manualOverride: Boolean(reservation.payment_status_manual_override),
    ...calculatePaymentStatus(
      reservation,
      (charges ?? []).filter((charge) => charge.reservation_id === reservation.reservation_id)
    ),
  }));
  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    year,
    total: results.length,
    completed: results.filter((item) => item.status === "完了").length,
    unpaid: results.filter((item) => item.status === "未払い").map((item) => item.reservationId),
    manualOverrides: results.filter((item) => item.manualOverride).map((item) => item.reservationId),
  }, null, 2));
  if (!execute) return;
  for (const item of results) {
    await syncAutomaticPaymentStatus(supabase, item.reservationId);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
