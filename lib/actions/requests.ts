"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REQUEST_STATUS_OPTIONS } from "@/lib/queries/requests";
import { DEFAULTS } from "@/lib/config/forms";

type UpdateResult = { ok: true } | { ok: false; message: string };

export async function updateRequestAction(
  _prevState: UpdateResult,
  formData: FormData
): Promise<UpdateResult> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const rejectReason = String(formData.get("reject_reason") ?? "").trim();
  const internalMemo = String(formData.get("internal_memo") ?? "").trim();
  const linkedReservationId = String(
    formData.get("linked_reservation_id") ?? ""
  ).trim();

  if (!requestId) {
    return { ok: false, message: "リクエストIDが不足しています。" };
  }

  if (!REQUEST_STATUS_OPTIONS.includes(status as (typeof REQUEST_STATUS_OPTIONS)[number])) {
    return { ok: false, message: "ステータスが不正です。" };
  }

  if (status === "却下" && !rejectReason) {
    return { ok: false, message: "却下時は却下理由を入力してください。" };
  }

  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("reservation_requests")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();

  if (currentError) {
    return { ok: false, message: currentError.message };
  }
  if (!current) {
    return { ok: false, message: "対象リクエストが見つかりません。" };
  }

  let nextLinkedReservationId = linkedReservationId || null;

  // 承認時: 連携予約が無ければ仮予約を自動作成（GAS承認フロー相当）
  if (status === "承認済" && !nextLinkedReservationId) {
    const provisionalId = String(current.request_id);
    const nowIso = new Date().toISOString();
    const provisional = {
      reservation_id: provisionalId,
      access_key: current.access_key || null,
      import_source: "リクエスト",
      import_row_id: current.import_row_id || null,
      request_id: current.request_id,
      channel: DEFAULTS.channel,
      status: "仮予約",
      last_name: current.last_name || null,
      first_name: current.first_name || null,
      representative_name: current.representative_name || null,
      last_name_kana: current.last_name_kana || null,
      first_name_kana: current.first_name_kana || null,
      name_kana: current.name_kana || null,
      group_type: current.group_type || null,
      group_name: null,
      email: current.email || null,
      phone: current.phone || null,
      phone_available: current.phone_available || null,
      postal_code: null,
      prefecture: null,
      city: null,
      address_line: null,
      address: null,
      check_in: current.check_in || null,
      check_out: current.check_out || null,
      nights: current.nights || null,
      guest_total: current.guest_total || null,
      adult_male: null,
      adult_female: null,
      boy_student: null,
      girl_student: null,
      age_3plus: null,
      under_3: null,
      arrival_time: null,
      transport: null,
      vehicle_count: null,
      meal: null,
      bbq: null,
      inquiry: current.inquiry || null,
      travel_purpose: null,
      travel_purpose_other: null,
      referral: null,
      referral_other: null,
      last_stay: null,
      assignment_status: DEFAULTS.assignmentStatus,
      companion_form_answered: false,
      completion_email_sent: false,
      completion_email_sent_at: null,
      day11_email_sent: false,
      day11_email_sent_at: null,
      day3_email_sent: false,
      day3_email_sent_at: null,
      payment_method: null,
      payment_status: DEFAULTS.paymentStatus,
      customer_id: null,
      internal_memo: null,
      gcal_event_id: null,
      is_archived: false,
      sheet_created_at: nowIso,
      sheet_updated_at: nowIso,
      synced_at: nowIso,
      updated_at: nowIso,
    };

    const { error: provisionalError } = await supabase
      .from("reservations")
      .upsert(provisional, { onConflict: "reservation_id" });
    if (provisionalError) {
      return { ok: false, message: provisionalError.message };
    }
    nextLinkedReservationId = provisionalId;
  }

  // 連携済ステータスは予約ID必須
  if (status === "本予約連携済" && !nextLinkedReservationId) {
    return { ok: false, message: "本予約連携済にする場合は連携予約IDが必要です。" };
  }
  const payload: Record<string, unknown> = {
    status,
    reject_reason: status === "却下" ? rejectReason : null,
    internal_memo: internalMemo || null,
    linked_reservation_id: nextLinkedReservationId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("reservation_requests")
    .update(payload)
    .eq("request_id", requestId);

  if (error) {
    return { ok: false, message: error.message };
  }

  // 予約側にも request_id を反映
  if (nextLinkedReservationId) {
    const { error: reservationLinkError } = await supabase
      .from("reservations")
      .update({
        request_id: requestId,
        access_key: current.access_key || null,
        updated_at: new Date().toISOString(),
      })
      .eq("reservation_id", nextLinkedReservationId);
    if (reservationLinkError) {
      return { ok: false, message: reservationLinkError.message };
    }
  }

  revalidatePath("/requests");
  revalidatePath(`/requests/${encodeURIComponent(requestId)}`);
  revalidatePath("/");
  return { ok: true };
}
