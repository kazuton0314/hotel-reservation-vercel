"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  revalidateCustomers,
  revalidateReservationDetail,
  revalidateReservationMailFlags,
  revalidateReservationStatus,
  revalidateReservationsList,
} from "@/lib/cache/revalidate";
import { upsertCustomerFromReservation } from "@/lib/services/customer-index";
import { DEFAULTS } from "@/lib/config/forms";
import {
  joinMultiSelectValues,
  PAYMENT_STATUS_OPTIONS,
  RESERVATION_STATUS_OPTIONS,
} from "@/lib/config/field-options";
import {
  buildAddress,
  calculateNights,
  formatDateIso,
  joinName,
  parseDateValue,
} from "@/lib/import/date-utils";
import { nextManualReservationId } from "@/lib/import/id-generation";
import { createStaffClient, createAdminClient } from "@/lib/supabase/server";
import { generateAccessKey } from "@/lib/utils/access-key";
import { updateRowWithLock } from "@/lib/utils/optimistic-lock";
import { syncReservationToGCal } from "@/lib/services/gcal-sync";
import { syncAssignmentStatus } from "@/lib/services/assignment-status";
import { syncRoomAssignmentGuestBreakdown } from "@/lib/services/room-assignment-guest-sync";
import { syncAssignmentStayDates } from "@/lib/services/room-assignment-stay-sync";
import {
  clearRoomAssignmentsForReservation,
  shouldClearRoomAssignmentsOnStatus,
} from "@/lib/services/room-assignment-lifecycle";
import {
  normalizeGuestBreakdownForStorage,
  normalizeGuestTotalForStorage,
} from "@/lib/utils/guest-count-format";

type SavedGuestFields = {
  guestTotal: string | null;
  adultMale: string | null;
  adultFemale: string | null;
  boyStudent: string | null;
  girlStudent: string | null;
  age3plus: string | null;
  under3: string | null;
};

type ActionResult =
  | {
      ok: true;
      reservationId?: string;
      updatedAt?: string;
      guests?: SavedGuestFields;
    }
  | { ok: false; message: string; conflict?: boolean };

export async function updateReservationAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  const expectedUpdatedAt =
    String(formData.get("expected_updated_at") ?? "").trim() || null;
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

  const supabase = await createStaffClient();
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
    guest_total: normalizeGuestTotalForStorage(
      String(formData.get("guest_total") ?? current.guest_total ?? "")
    ),
    adult_male: normalizeGuestBreakdownForStorage(
      String(formData.get("adult_male") ?? current.adult_male ?? "")
    ),
    adult_female: normalizeGuestBreakdownForStorage(
      String(formData.get("adult_female") ?? current.adult_female ?? "")
    ),
    boy_student: normalizeGuestBreakdownForStorage(
      String(formData.get("boy_student") ?? current.boy_student ?? "")
    ),
    girl_student: normalizeGuestBreakdownForStorage(
      String(formData.get("girl_student") ?? current.girl_student ?? "")
    ),
    age_3plus: normalizeGuestBreakdownForStorage(
      String(formData.get("age_3plus") ?? current.age_3plus ?? "")
    ),
    under_3: normalizeGuestBreakdownForStorage(
      String(formData.get("under_3") ?? current.under_3 ?? "")
    ),
    arrival_time: String(
      formData.get("arrival_time") ?? current.arrival_time ?? ""
    ),
    transport: String(formData.get("transport") ?? current.transport ?? ""),
    vehicle_count: String(
      formData.get("vehicle_count") ?? current.vehicle_count ?? ""
    ),
    meal: String(formData.get("meal") ?? current.meal ?? ""),
    bbq: String(formData.get("bbq") ?? current.bbq ?? ""),
    somen: String(formData.get("somen") ?? current.somen ?? ""),
    inquiry: String(formData.get("inquiry") ?? current.inquiry ?? ""),
    travel_purpose: joinMultiSelectValues(
      formData.getAll("travel_purpose").map((v) => String(v))
    ),
    travel_purpose_other: String(
      formData.get("travel_purpose_other") ?? current.travel_purpose_other ?? ""
    ),
    referral: String(formData.get("referral") ?? current.referral ?? ""),
    referral_other: String(
      formData.get("referral_other") ?? current.referral_other ?? ""
    ),
    last_stay: String(formData.get("last_stay") ?? current.last_stay ?? ""),
    internal_memo: String(
      formData.get("internal_memo") ?? current.internal_memo ?? ""
    ),
    guest_memo: String(
      formData.get("guest_memo") ?? current.guest_memo ?? ""
    ),
    payment_status: String(
      formData.get("payment_status") ?? current.payment_status ?? ""
    ),
    updated_at: new Date().toISOString(),
  };

  if (checkIn) payload.check_in = formatDateIso(checkIn);
  if (checkOut) payload.check_out = formatDateIso(checkOut);
  if (checkIn && checkOut) {
    payload.nights = calculateNights(checkIn, checkOut);
  }

  const updatedResult = await updateRowWithLock<Record<string, unknown>>({
    supabase,
    table: "reservations",
    idColumn: "reservation_id",
    idValue: reservationId,
    expectedUpdatedAt,
    patch: payload,
  });
  if (!updatedResult.ok) {
    return {
      ok: false,
      message: updatedResult.message,
      conflict: updatedResult.conflict,
    };
  }

  const nextStatus = String(payload.status ?? current.status ?? "");
  const prevStatus = String(current.status ?? "");
  if (
    shouldClearRoomAssignmentsOnStatus(nextStatus) &&
    !shouldClearRoomAssignmentsOnStatus(prevStatus)
  ) {
    await clearRoomAssignmentsForReservation(supabase, reservationId);
  }

  const nextCheckIn = String(payload.check_in ?? current.check_in ?? "");
  const nextCheckOut = String(payload.check_out ?? current.check_out ?? "");
  const datesChanged =
    nextCheckIn !== String(current.check_in ?? "") ||
    nextCheckOut !== String(current.check_out ?? "");
  if (
    datesChanged &&
    nextCheckIn &&
    nextCheckOut &&
    !shouldClearRoomAssignmentsOnStatus(nextStatus)
  ) {
    await syncAssignmentStayDates(
      supabase,
      reservationId,
      nextCheckIn,
      nextCheckOut
    );
  }

  const guestTouched =
    String(payload.adult_male ?? "") !== String(current.adult_male ?? "") ||
    String(payload.adult_female ?? "") !== String(current.adult_female ?? "") ||
    String(payload.boy_student ?? "") !== String(current.boy_student ?? "") ||
    String(payload.girl_student ?? "") !== String(current.girl_student ?? "") ||
    String(payload.age_3plus ?? "") !== String(current.age_3plus ?? "") ||
    String(payload.under_3 ?? "") !== String(current.under_3 ?? "");

  // 人数不一致も一覧の未割当フィルタに載せるため、宿泊人数変更後に再同期
  if (!shouldClearRoomAssignmentsOnStatus(nextStatus)) {
    await syncAssignmentStatus(supabase, reservationId);
  }

  // 1部屋のときは台帳→部屋割へ人数を同期（予約人数の保存を優先して同一リクエスト内で行う）
  if (guestTouched && !shouldClearRoomAssignmentsOnStatus(nextStatus)) {
    await syncRoomAssignmentGuestBreakdown(supabase, reservationId, {
      adult_male: payload.adult_male,
      adult_female: payload.adult_female,
      boy_student: payload.boy_student,
      girl_student: payload.girl_student,
      age_3plus: payload.age_3plus,
      under_3: payload.under_3,
    });
    await syncAssignmentStatus(supabase, reservationId);
  }

  const { data: fresh } = await supabase
    .from("reservations")
    .select(
      "updated_at, guest_total, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3"
    )
    .eq("reservation_id", reservationId)
    .maybeSingle();

  revalidateReservationDetail(reservationId);
  revalidatePath(`/reservations/${encodeURIComponent(reservationId)}`);

  after(async () => {
    const admin = createAdminClient();
    const { data: updated } = await admin
      .from("reservations")
      .select(
        "reservation_id, customer_id, representative_name, name_kana, email, phone, check_in, check_out, status, is_archived, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3"
      )
      .eq("reservation_id", reservationId)
      .maybeSingle();
    if (updated) {
      await upsertCustomerFromReservation(admin, updated);
      revalidateCustomers();
    }
    await syncReservationToGCal(admin, reservationId);
  });

  // 書き込み済み payload を正とする（直後の再読込が遅れても UI が戻らない）
  const guests: SavedGuestFields = {
    guestTotal: payload.guest_total as string | null,
    adultMale: payload.adult_male as string | null,
    adultFemale: payload.adult_female as string | null,
    boyStudent: payload.boy_student as string | null,
    girlStudent: payload.girl_student as string | null,
    age3plus: payload.age_3plus as string | null,
    under3: payload.under_3 as string | null,
  };

  return {
    ok: true,
    updatedAt: String(
      fresh?.updated_at ?? updatedResult.data.updated_at ?? payload.updated_at ?? ""
    ),
    guests,
  };
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

  const supabase = await createStaffClient();
  const { error } = await supabase
    .from("reservations")
    .update(payload)
    .eq("reservation_id", reservationId);

  if (error) return { ok: false, message: error.message };

  revalidateReservationMailFlags(reservationId);
  return { ok: true };
}

const MAIL_KIND_FIELD: Record<string, { flag: string; at: string }> = {
  予約確定: { flag: "completion_email_sent", at: "completion_email_sent_at" },
  "11日前": { flag: "day11_email_sent", at: "day11_email_sent_at" },
  "3日前": { flag: "day3_email_sent", at: "day3_email_sent_at" },
};

export async function setMailKindSentAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  const mailKind = String(formData.get("mail_kind") ?? "").trim();
  const sent = formData.get("sent") === "true";
  if (!reservationId) return { ok: false, message: "予約IDが不足しています。" };

  const field = MAIL_KIND_FIELD[mailKind];
  if (!field) return { ok: false, message: "メール種別が不正です。" };

  const nowIso = new Date().toISOString();
  const supabase = await createStaffClient();
  const { error } = await supabase
    .from("reservations")
    .update({
      [field.flag]: sent,
      [field.at]: sent ? nowIso : null,
      updated_at: nowIso,
    })
    .eq("reservation_id", reservationId);
  if (error) return { ok: false, message: error.message };

  revalidateReservationMailFlags(reservationId);
  return { ok: true };
}

export async function quickReservationStatusAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const expectedUpdatedAt =
    String(formData.get("expected_updated_at") ?? "").trim() || null;
  if (!reservationId) return { ok: false, message: "予約IDが不足しています。" };
  if (
    !RESERVATION_STATUS_OPTIONS.includes(
      status as (typeof RESERVATION_STATUS_OPTIONS)[number]
    )
  ) {
    return { ok: false, message: "ステータスが不正です。" };
  }

  const supabase = await createStaffClient();
  const nowIso = new Date().toISOString();
  const result = await updateRowWithLock<Record<string, unknown>>({
    supabase,
    table: "reservations",
    idColumn: "reservation_id",
    idValue: reservationId,
    expectedUpdatedAt,
    patch: { status, updated_at: nowIso },
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      conflict: result.conflict,
    };
  }

  if (shouldClearRoomAssignmentsOnStatus(status)) {
    await clearRoomAssignmentsForReservation(supabase, reservationId);
    revalidateReservationDetail(reservationId);
  } else {
    revalidateReservationStatus(reservationId);
  }

  after(async () => {
    const admin = createAdminClient();
    await syncReservationToGCal(admin, reservationId);
  });

  return {
    ok: true,
    updatedAt: String(result.data.updated_at ?? nowIso),
  };
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
  const supabase = await createStaffClient();
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
    check_in: formatDateIso(checkIn),
    check_out: formatDateIso(checkOut),
    nights: calculateNights(checkIn, checkOut),
    guest_total: normalizeGuestTotalForStorage(
      String(formData.get("guest_total") ?? "")
    ),
    adult_male: normalizeGuestBreakdownForStorage(
      String(formData.get("adult_male") ?? "")
    ),
    adult_female: normalizeGuestBreakdownForStorage(
      String(formData.get("adult_female") ?? "")
    ),
    boy_student: normalizeGuestBreakdownForStorage(
      String(formData.get("boy_student") ?? "")
    ),
    girl_student: normalizeGuestBreakdownForStorage(
      String(formData.get("girl_student") ?? "")
    ),
    age_3plus: normalizeGuestBreakdownForStorage(
      String(formData.get("age_3plus") ?? "")
    ),
    under_3: normalizeGuestBreakdownForStorage(
      String(formData.get("under_3") ?? "")
    ),
    arrival_time: String(formData.get("arrival_time") ?? "").trim() || null,
    transport: String(formData.get("transport") ?? "").trim() || null,
    vehicle_count: String(formData.get("vehicle_count") ?? "").trim() || null,
    meal: String(formData.get("meal") ?? "").trim() || null,
    bbq: String(formData.get("bbq") ?? "").trim() || null,
    somen: String(formData.get("somen") ?? "").trim() || null,
    inquiry: String(formData.get("inquiry") ?? "").trim() || null,
    travel_purpose:
      joinMultiSelectValues(
        formData.getAll("travel_purpose").map((v) => String(v))
      ) || null,
    travel_purpose_other:
      String(formData.get("travel_purpose_other") ?? "").trim() || null,
    referral: String(formData.get("referral") ?? "").trim() || null,
    referral_other: String(formData.get("referral_other") ?? "").trim() || null,
    last_stay: String(formData.get("last_stay") ?? "").trim() || null,
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
    guest_memo: String(formData.get("guest_memo") ?? "").trim() || null,
    gcal_event_id: null,
    is_archived: false,
    sheet_created_at: nowIso,
    sheet_updated_at: nowIso,
    synced_at: nowIso,
    updated_at: nowIso,
  };

  const { error } = await supabase.from("reservations").insert(record);
  if (error) return { ok: false, message: error.message };

  await upsertCustomerFromReservation(supabase, {
    ...record,
    is_archived: false,
  });
  after(async () => {
    const admin = createAdminClient();
    await syncReservationToGCal(admin, reservationId);
  });
  revalidateCustomers();
  revalidateReservationsList();
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

  const supabase = await createStaffClient();

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

  // 日次アーカイブと同様、紐づく部屋割の is_archived も揃える（復元時は戻す）
  const { error: roomError } = await supabase
    .from("room_assignments")
    .update({ is_archived: archive, updated_at: nowIso })
    .eq("reservation_id", reservationId);
  if (roomError) return { ok: false, message: roomError.message };

  // アーカイブ状態に合わせた部屋割で assignment_status を再計算
  await syncAssignmentStatus(supabase, reservationId);

  if (!archive) {
    after(async () => {
      const admin = createAdminClient();
      await syncReservationToGCal(admin, reservationId);
    });
  }

  revalidateReservationDetail(reservationId);
  return { ok: true };
}
