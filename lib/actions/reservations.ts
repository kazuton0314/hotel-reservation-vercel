"use server";

import { revalidatePath } from "next/cache";
import { DEFAULTS } from "@/lib/config/forms";
import {
  buildAddress,
  calculateNights,
  joinName,
  parseDateValue,
} from "@/lib/import/date-utils";
import { nextManualReservationId } from "@/lib/import/id-generation";
import { createClient } from "@/lib/supabase/server";
import { generateAccessKey } from "@/lib/utils/access-key";

type ActionResult =
  | { ok: true; reservationId?: string }
  | { ok: false; message: string };

export const RESERVATION_STATUS_OPTIONS = [
  "仮予約",
  "確定",
  "キャンセル",
] as const;

export const PAYMENT_STATUS_OPTIONS = ["未払い", "支払済", "一部支払"] as const;

export async function updateReservationAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  if (!reservationId) {
    return { ok: false, message: "予約IDが不足しています。" };
  }

  const status = String(formData.get("status") ?? "").trim();
  if (
    status &&
    !RESERVATION_STATUS_OPTIONS.includes(
      status as (typeof RESERVATION_STATUS_OPTIONS)[number]
    )
  ) {
    return { ok: false, message: "ステータスが不正です。" };
  }

  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("reservations")
    .select("*")
    .eq("reservation_id", reservationId)
    .maybeSingle();

  if (currentError) return { ok: false, message: currentError.message };
  if (!current) return { ok: false, message: "予約が見つかりません。" };

  const lastName = String(formData.get("last_name") ?? current.last_name ?? "");
  const firstName = String(
    formData.get("first_name") ?? current.first_name ?? ""
  );
  const lastNameKana = String(
    formData.get("last_name_kana") ?? current.last_name_kana ?? ""
  );
  const firstNameKana = String(
    formData.get("first_name_kana") ?? current.first_name_kana ?? ""
  );
  const postalCode = String(
    formData.get("postal_code") ?? current.postal_code ?? ""
  );
  const prefecture = String(
    formData.get("prefecture") ?? current.prefecture ?? ""
  );
  const city = String(formData.get("city") ?? current.city ?? "");
  const addressLine = String(
    formData.get("address_line") ?? current.address_line ?? ""
  );

  const checkInRaw = formData.get("check_in");
  const checkOutRaw = formData.get("check_out");
  const checkIn =
    checkInRaw !== null
      ? parseDateValue(checkInRaw)
      : parseDateValue(current.check_in);
  const checkOut =
    checkOutRaw !== null
      ? parseDateValue(checkOutRaw)
      : parseDateValue(current.check_out);

  if (checkIn && checkOut && checkOut.getTime() <= checkIn.getTime()) {
    return {
      ok: false,
      message: "チェックアウト日はチェックインより後にしてください。",
    };
  }

  const payload: Record<string, unknown> = {
    status: status || current.status,
    channel: String(formData.get("channel") ?? current.channel ?? ""),
    group_type: String(formData.get("group_type") ?? current.group_type ?? ""),
    group_name: String(formData.get("group_name") ?? current.group_name ?? ""),
    last_name: lastName,
    first_name: firstName,
    representative_name: joinName(lastName, firstName),
    last_name_kana: lastNameKana,
    first_name_kana: firstNameKana,
    name_kana: joinName(lastNameKana, firstNameKana),
    email: String(formData.get("email") ?? current.email ?? ""),
    phone: String(formData.get("phone") ?? current.phone ?? ""),
    phone_available: String(
      formData.get("phone_available") ?? current.phone_available ?? ""
    ),
    postal_code: postalCode,
    prefecture,
    city,
    address_line: addressLine,
    address: buildAddress(postalCode, prefecture, city, addressLine),
    guest_total: String(formData.get("guest_total") ?? current.guest_total ?? ""),
    adult_male: String(formData.get("adult_male") ?? current.adult_male ?? ""),
    adult_female: String(
      formData.get("adult_female") ?? current.adult_female ?? ""
    ),
    arrival_time: String(
      formData.get("arrival_time") ?? current.arrival_time ?? ""
    ),
    transport: String(formData.get("transport") ?? current.transport ?? ""),
    meal: String(formData.get("meal") ?? current.meal ?? ""),
    bbq: String(formData.get("bbq") ?? current.bbq ?? ""),
    inquiry: String(formData.get("inquiry") ?? current.inquiry ?? ""),
    internal_memo: String(
      formData.get("internal_memo") ?? current.internal_memo ?? ""
    ),
    payment_status: String(
      formData.get("payment_status") ?? current.payment_status ?? ""
    ),
    updated_at: new Date().toISOString(),
  };

  if (checkIn) payload.check_in = checkIn.toISOString().slice(0, 10);
  if (checkOut) payload.check_out = checkOut.toISOString().slice(0, 10);
  if (checkIn && checkOut) {
    payload.nights = calculateNights(checkIn, checkOut);
  }

  const { error } = await supabase
    .from("reservations")
    .update(payload)
    .eq("reservation_id", reservationId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${encodeURIComponent(reservationId)}`);
  revalidatePath("/");
  return { ok: true };
}

export async function updateMailFlagsAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  if (!reservationId) {
    return { ok: false, message: "予約IDが不足しています。" };
  }

  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = { updated_at: nowIso };

  for (const key of [
    "completion_email_sent",
    "day11_email_sent",
    "day3_email_sent",
  ] as const) {
    const checked = formData.get(key) === "on";
    payload[key] = checked;
    const atKey = `${key}_at` as const;
    if (checked) {
      payload[atKey] = nowIso;
    } else {
      payload[atKey] = null;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("reservations")
    .update(payload)
    .eq("reservation_id", reservationId);

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/reservations/${encodeURIComponent(reservationId)}`);
  return { ok: true };
}

export async function createManualReservationAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const lastName = String(formData.get("last_name") ?? "").trim();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const representativeName =
    String(formData.get("representative_name") ?? "").trim() ||
    joinName(lastName, firstName);

  if (!representativeName) {
    return { ok: false, message: "代表者名（姓・名）を入力してください。" };
  }

  const checkIn = parseDateValue(formData.get("check_in"));
  const checkOut = parseDateValue(formData.get("check_out"));
  if (!checkIn || !checkOut) {
    return {
      ok: false,
      message: "チェックイン・チェックアウト日を入力してください。",
    };
  }
  if (checkOut.getTime() <= checkIn.getTime()) {
    return {
      ok: false,
      message: "チェックアウト日はチェックインより後にしてください。",
    };
  }

  const status = String(formData.get("status") ?? "確定").trim();
  const supabase = await createClient();
  const reservationId = await nextManualReservationId(supabase);
  const nowIso = new Date().toISOString();
  const lastNameKana = String(formData.get("last_name_kana") ?? "").trim();
  const firstNameKana = String(formData.get("first_name_kana") ?? "").trim();
  const postalCode = String(formData.get("postal_code") ?? "").trim();
  const prefecture = String(formData.get("prefecture") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const addressLine = String(formData.get("address_line") ?? "").trim();

  const record = {
    reservation_id: reservationId,
    access_key: generateAccessKey(),
    import_source: "手動",
    import_row_id: null,
    request_id: null,
    channel: String(formData.get("channel") ?? "代入力").trim(),
    status,
    last_name: lastName,
    first_name: firstName,
    representative_name: representativeName,
    last_name_kana: lastNameKana || null,
    first_name_kana: firstNameKana || null,
    name_kana: joinName(lastNameKana, firstNameKana) || null,
    group_type: String(formData.get("group_type") ?? "").trim() || null,
    group_name: String(formData.get("group_name") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    phone_available:
      String(formData.get("phone_available") ?? "").trim() || null,
    postal_code: postalCode || null,
    prefecture: prefecture || null,
    city: city || null,
    address_line: addressLine || null,
    address: buildAddress(postalCode, prefecture, city, addressLine) || null,
    check_in: checkIn.toISOString().slice(0, 10),
    check_out: checkOut.toISOString().slice(0, 10),
    nights: calculateNights(checkIn, checkOut),
    guest_total: String(formData.get("guest_total") ?? "").trim() || null,
    adult_male: String(formData.get("adult_male") ?? "").trim() || null,
    adult_female: String(formData.get("adult_female") ?? "").trim() || null,
    boy_student: null,
    girl_student: null,
    age_3plus: null,
    under_3: null,
    arrival_time: String(formData.get("arrival_time") ?? "").trim() || null,
    transport: String(formData.get("transport") ?? "").trim() || null,
    vehicle_count: null,
    meal: String(formData.get("meal") ?? "").trim() || null,
    bbq: String(formData.get("bbq") ?? "").trim() || null,
    inquiry: String(formData.get("inquiry") ?? "").trim() || null,
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
    internal_memo: String(formData.get("internal_memo") ?? "").trim() || null,
    gcal_event_id: null,
    is_archived: false,
    sheet_created_at: nowIso,
    sheet_updated_at: nowIso,
    synced_at: nowIso,
    updated_at: nowIso,
  };

  const { error } = await supabase.from("reservations").insert(record);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/reservations");
  revalidatePath("/");
  return { ok: true, reservationId };
}

export async function archiveReservationAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  const archive = formData.get("archive") === "true";

  if (!reservationId) {
    return { ok: false, message: "予約IDが不足しています。" };
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("reservations")
    .update({
      is_archived: archive,
      updated_at: nowIso,
      sheet_updated_at: nowIso,
    })
    .eq("reservation_id", reservationId);

  if (error) return { ok: false, message: error.message };

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${encodeURIComponent(reservationId)}`);
  revalidatePath("/");
  return { ok: true };
}
