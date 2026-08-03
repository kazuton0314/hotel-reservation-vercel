import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { DEFAULTS } from "@/lib/config/forms";
import { deleteGCalEventIfAny, syncReservationToGCal } from "@/lib/services/gcal-sync";
import { createAdminClient } from "@/lib/supabase/server";

export async function buildProvisionalFromRequest(
  current: Record<string, unknown>,
  provisionalId: string
) {
  const nowIso = new Date().toISOString();
  return {
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
}

export async function createProvisionalForRequest(
  supabase: SupabaseClient,
  current: Record<string, unknown>
): Promise<{ ok: true; provisionalId: string } | { ok: false; message: string }> {
  const provisionalId = String(current.request_id);
  const provisional = await buildProvisionalFromRequest(current, provisionalId);
  const { error } = await supabase
    .from("reservations")
    .upsert(provisional, { onConflict: "reservation_id" });
  if (error) return { ok: false, message: error.message };

  const { error: linkError } = await supabase
    .from("reservations")
    .update({
      request_id: String(current.request_id),
      access_key: current.access_key || null,
      updated_at: new Date().toISOString(),
    })
    .eq("reservation_id", provisionalId);
  if (linkError) return { ok: false, message: linkError.message };

  after(async () => {
    const admin = createAdminClient();
    await syncReservationToGCal(admin, provisionalId);
  });

  return { ok: true, provisionalId };
}

/** 差し戻し時: 連携仮予約を削除（確定本予約は残す） */
export async function deleteLinkedProvisionalIfAny(
  supabase: SupabaseClient,
  requestId: string,
  linkedReservationId: string | null
): Promise<string | null> {
  if (!linkedReservationId) return null;

  const { data: reservation } = await supabase
    .from("reservations")
    .select("reservation_id, status, request_id, gcal_event_id")
    .eq("reservation_id", linkedReservationId)
    .maybeSingle();

  if (
    !reservation ||
    reservation.status !== "仮予約" ||
    String(reservation.request_id) !== requestId
  ) {
    return linkedReservationId;
  }

  await deleteGCalEventIfAny(reservation.gcal_event_id);
  await supabase
    .from("reservations")
    .delete()
    .eq("reservation_id", linkedReservationId);

  return null;
}
