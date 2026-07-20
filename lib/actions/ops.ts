"use server";

import { revalidatePath } from "next/cache";
import { createStaffClient } from "@/lib/supabase/server";
import { linkRequestToReservation } from "@/lib/services/request-reservation-link";

export async function confirmRequestReservationLinkAction(formData: FormData): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  if (!requestId || !reservationId) return { ok: false, message: "IDが不足しています。" };
  const supabase = await createStaffClient();

  const { data: req } = await supabase
    .from("reservation_requests")
    .select("request_id, linked_reservation_id, status, access_key")
    .eq("request_id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, message: "リクエストが見つかりません。" };

  const result = await linkRequestToReservation(supabase, {
    requestId,
    reservationId,
    accessKey: (req.access_key as string | null) ?? null,
    currentStatus: String(req.status ?? ""),
    currentLinkedId: (req.linked_reservation_id as string | null) ?? null,
  });
  if (!result.ok) return result;

  revalidatePath("/settings/operations");
  return { ok: true };
}
