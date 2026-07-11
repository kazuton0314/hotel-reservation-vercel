"use server";

import { revalidatePath } from "next/cache";
import { createStaffClient } from "@/lib/supabase/server";

export async function confirmRequestReservationLinkAction(formData: FormData): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  if (!requestId || !reservationId) return { ok: false, message: "IDが不足しています。" };
  const supabase = await createStaffClient();
  const nowIso = new Date().toISOString();
  const [reqRes, rsvRes] = await Promise.all([
    supabase
      .from("reservation_requests")
      .update({
        status: "本予約連携済",
        linked_reservation_id: reservationId,
        updated_at: nowIso,
      })
      .eq("request_id", requestId),
    supabase
      .from("reservations")
      .update({
        request_id: requestId,
        updated_at: nowIso,
      })
      .eq("reservation_id", reservationId),
  ]);
  if (reqRes.error || rsvRes.error) {
    return { ok: false, message: reqRes.error?.message ?? rsvRes.error?.message ?? "連携に失敗しました" };
  }
  revalidatePath("/settings/operations");
  return { ok: true };
}
