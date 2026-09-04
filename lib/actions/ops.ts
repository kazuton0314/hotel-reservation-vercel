"use server";

import { revalidatePath } from "next/cache";
import {
  revalidateReservationDetail,
  revalidateReservationsList,
  revalidateRequestsList,
} from "@/lib/cache/revalidate";
import { createStaffClient } from "@/lib/supabase/server";
import { linkRequestToReservation } from "@/lib/services/request-reservation-link";
import {
  countReservationIdReferences,
  renameReservationId,
  type ReservationIdRefCounts,
  type RenameReservationIdResult,
} from "@/lib/services/rename-reservation-id";

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

export async function previewRenameReservationIdAction(
  fromId: string
): Promise<
  | {
      ok: true;
      fromId: string;
      representativeName: string | null;
      status: string | null;
      checkIn: string | null;
      refs: ReservationIdRefCounts;
    }
  | { ok: false; message: string }
> {
  const id = String(fromId ?? "").trim();
  if (!id) return { ok: false, message: "変更元の予約IDを入力してください。" };
  try {
    const supabase = await createStaffClient();
    const { data, error } = await supabase
      .from("reservations")
      .select("reservation_id, representative_name, status, check_in")
      .eq("reservation_id", id)
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!data) return { ok: false, message: `予約が見つかりません: ${id}` };
    const refs = await countReservationIdReferences(supabase, id);
    return {
      ok: true,
      fromId: id,
      representativeName: (data.representative_name as string | null) ?? null,
      status: (data.status as string | null) ?? null,
      checkIn: (data.check_in as string | null) ?? null,
      refs,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "プレビューに失敗しました",
    };
  }
}

export async function renameReservationIdAction(
  fromId: string,
  toId: string
): Promise<
  { ok: true; result: RenameReservationIdResult } | { ok: false; message: string }
> {
  try {
    const supabase = await createStaffClient();
    const result = await renameReservationId(supabase, { fromId, toId });
    revalidateReservationDetail(result.fromId);
    revalidateReservationDetail(result.toId);
    revalidateReservationsList();
    revalidateRequestsList();
    revalidatePath("/settings/operations");
    revalidatePath(`/reservations/${encodeURIComponent(result.fromId)}`);
    revalidatePath(`/reservations/${encodeURIComponent(result.toId)}`);
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "予約IDの変更に失敗しました",
    };
  }
}
