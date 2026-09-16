"use server";

import { revalidatePath } from "next/cache";
import { revalidateReservationDetail } from "@/lib/cache/revalidate";
import { RESERVATION_CHARGE_CATEGORY_OPTIONS } from "@/lib/config/field-options";
import { createStaffClient } from "@/lib/supabase/server";
import { syncAutomaticPaymentStatus } from "@/lib/services/payment-status";

type ActionResult = { ok: true } | { ok: false; message: string };
type ParsedNumber = { ok: true; value: number } | { ok: false; error: string };
type ChargePayload = {
  category: string;
  label: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
  updated_at: string;
};
type ParsedCharge =
  | { ok: true; value: ChargePayload }
  | { ok: false; error: string };

function parseNonNegativeNumber(
  value: FormDataEntryValue | null,
  label: string
): ParsedNumber {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: false, error: `${label}を入力してください。` };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, error: `${label}は0以上の数値で入力してください。` };
  }
  return { ok: true, value: parsed };
}

function readCharge(formData: FormData): ParsedCharge {
  const category = String(formData.get("category") ?? "").trim();
  if (!RESERVATION_CHARGE_CATEGORY_OPTIONS.includes(
    category as (typeof RESERVATION_CHARGE_CATEGORY_OPTIONS)[number]
  )) {
    return { ok: false, error: "料金種別が不正です。" };
  }
  const unitPrice = parseNonNegativeNumber(formData.get("unit_price"), "単価");
  if (!unitPrice.ok) return unitPrice;
  const quantity = parseNonNegativeNumber(formData.get("quantity"), "数量");
  if (!quantity.ok) return quantity;
  const subtotal = Math.round(unitPrice.value * quantity.value);
  return {
    ok: true,
    value: {
      category,
      label: String(formData.get("label") ?? "").trim() || null,
      unit_price: unitPrice.value,
      quantity: quantity.value,
      subtotal,
      updated_at: new Date().toISOString(),
    },
  };
}

function refresh(reservationId: string) {
  revalidateReservationDetail(reservationId);
  revalidatePath(`/reservations/${encodeURIComponent(reservationId)}`);
}

export async function addReservationChargeAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  if (!reservationId) return { ok: false, message: "予約IDが不足しています。" };
  const parsed = readCharge(formData);
  if (!parsed.ok) return { ok: false, message: parsed.error };

  const supabase = await createStaffClient();
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("reservation_id")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (reservationError) return { ok: false, message: reservationError.message };
  if (!reservation) return { ok: false, message: "予約が見つかりません。" };

  const { data: last } = await supabase
    .from("reservation_charges")
    .select("sort_order")
    .eq("reservation_id", reservationId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const { error } = await supabase.from("reservation_charges").insert({
    reservation_id: reservationId,
    ...parsed.value,
    source: "手動",
    sort_order: (last?.[0]?.sort_order ?? 0) + 1,
  });
  if (error) return { ok: false, message: error.message };
  await syncAutomaticPaymentStatus(supabase, reservationId);
  refresh(reservationId);
  return { ok: true };
}

export async function updateReservationChargeAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const id = String(formData.get("charge_id") ?? "").trim();
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  if (!id || !reservationId) return { ok: false, message: "料金明細IDが不足しています。" };
  const parsed = readCharge(formData);
  if (!parsed.ok) return { ok: false, message: parsed.error };

  const supabase = await createStaffClient();
  const { error } = await supabase
    .from("reservation_charges")
    .update(parsed.value)
    .eq("id", id)
    .eq("reservation_id", reservationId);
  if (error) return { ok: false, message: error.message };
  await syncAutomaticPaymentStatus(supabase, reservationId);
  refresh(reservationId);
  return { ok: true };
}

export async function deleteReservationChargeAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const id = String(formData.get("charge_id") ?? "").trim();
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  if (!id || !reservationId) return { ok: false, message: "料金明細IDが不足しています。" };

  const supabase = await createStaffClient();
  const { error } = await supabase
    .from("reservation_charges")
    .delete()
    .eq("id", id)
    .eq("reservation_id", reservationId);
  if (error) return { ok: false, message: error.message };
  await syncAutomaticPaymentStatus(supabase, reservationId);
  refresh(reservationId);
  return { ok: true };
}

export async function toggleReservationPaymentStatusAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  const current = String(formData.get("current_status") ?? "未払い");
  if (!reservationId) return { ok: false, message: "予約IDが不足しています。" };
  const next = current === "完了" ? "未払い" : "完了";
  const supabase = await createStaffClient();
  const { error } = await supabase
    .from("reservations")
    .update({
      payment_status: next,
      payment_status_manual_override: true,
      updated_at: new Date().toISOString(),
    })
    .eq("reservation_id", reservationId);
  if (error) return { ok: false, message: error.message };
  refresh(reservationId);
  return { ok: true };
}

export async function resetReservationPaymentStatusAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  if (!reservationId) return { ok: false, message: "予約IDが不足しています。" };
  const supabase = await createStaffClient();
  const { error } = await supabase
    .from("reservations")
    .update({ payment_status_manual_override: false })
    .eq("reservation_id", reservationId);
  if (error) return { ok: false, message: error.message };
  try {
    await syncAutomaticPaymentStatus(supabase, reservationId, { force: true });
  } catch (syncError) {
    return { ok: false, message: syncError instanceof Error ? syncError.message : String(syncError) };
  }
  refresh(reservationId);
  return { ok: true };
}
