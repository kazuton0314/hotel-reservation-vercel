import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import type { MailEntityContext } from "@/lib/services/mail-placeholders";
import { formatDateIso, parseDateValue } from "@/lib/import/date-utils";
import { generateAccessKey } from "@/lib/utils/access-key";
import {
  buildCompanionFormUrl,
  resolveAppBaseUrl,
} from "@/lib/utils/companion-form-url";
import { formatGuestBreakdownMail } from "@/lib/utils/guest-display";
import { formatBbqDisplayLabel } from "@/lib/utils/occ-display";
import { resolveMailFromHeader } from "@/lib/services/mail-send";

const FACILITY_NAME = process.env.FACILITY_NAME ?? "みどりの時計台";
const STUDIO_BOOKING_URL = process.env.STUDIO_BOOKING_FORM_URL ?? "";

function joinName(last: string | null | undefined, first: string | null | undefined) {
  return [last, first].filter(Boolean).join(" ").trim();
}

function formatMailDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = parseDateValue(value);
  if (!d) return String(value).trim();
  return formatDateIso(d);
}

function formatNightsLabel(nights: number | null | undefined): string {
  if (nights == null || nights <= 0) return "";
  return `${nights}泊`;
}

function formatRejectReason(value: string | null | undefined): string {
  const reason = String(value ?? "").trim();
  return reason ? `【理由】\n${reason}` : "";
}

function formatArrivalTime(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  return v || "未設定";
}

function extractMailAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim();
}

/** リクエスト Host から公開 URL を組み立て（環境変数未設定時のフォールバック） */
async function appBaseUrlFromRequest(): Promise<string> {
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").trim();
    if (!host) return "";
    const forwardedProto = (h.get("x-forwarded-proto") ?? "").split(",")[0]?.trim();
    const proto =
      forwardedProto ||
      (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto}://${host}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

async function ensureReservationAccessKey(
  supabase: SupabaseClient,
  reservationId: string,
  current: string | null | undefined
): Promise<string> {
  const existing = String(current ?? "").trim();
  if (existing) return existing;

  const newKey = generateAccessKey();
  const { error } = await supabase
    .from("reservations")
    .update({
      access_key: newKey,
      updated_at: new Date().toISOString(),
    })
    .eq("reservation_id", reservationId);

  if (error) {
    // 競合で他が先に書いた場合は読み直す
    const { data } = await supabase
      .from("reservations")
      .select("access_key")
      .eq("reservation_id", reservationId)
      .maybeSingle();
    const recovered = String(data?.access_key ?? "").trim();
    if (recovered) return recovered;
    throw new Error(`同行者URL用の access_key 保存に失敗しました: ${error.message}`);
  }

  return newKey;
}

function baseContext(): MailEntityContext {
  const fromHeader = resolveMailFromHeader();
  return {
    facilityName: FACILITY_NAME,
    studioBookingUrl: STUDIO_BOOKING_URL,
    companionFormUrl: "",
    mailFrom: extractMailAddress(fromHeader),
  };
}

export async function buildMailEntityContext(
  supabase: SupabaseClient,
  entityType: string,
  entityId: string
): Promise<MailEntityContext> {
  const base = baseContext();
  // 公開URLは環境変数を優先（ゲスト向けリンクのため）。未設定時のみリクエスト Host を使う
  const appBase = resolveAppBaseUrl() || (await appBaseUrlFromRequest());

  if (entityType === "reservation" && entityId) {
    const { data } = await supabase
      .from("reservations")
      .select(
        "reservation_id, access_key, representative_name, last_name, first_name, name_kana, last_name_kana, first_name_kana, email, phone, check_in, check_out, nights, guest_total, adult_male, adult_female, boy_student, girl_student, age_3plus, under_3, arrival_time, bbq"
      )
      .eq("reservation_id", entityId)
      .maybeSingle();

    if (!data) return base;
    const accessKey = await ensureReservationAccessKey(
      supabase,
      data.reservation_id,
      data.access_key
    );
    return {
      ...base,
      representativeName: data.representative_name ?? joinName(data.last_name, data.first_name),
      lastName: data.last_name ?? "",
      firstName: data.first_name ?? "",
      nameKana: data.name_kana ?? joinName(data.last_name_kana, data.first_name_kana),
      email: data.email ?? "",
      phone: data.phone ?? "",
      reservationId: data.reservation_id,
      checkIn: formatMailDate(data.check_in),
      checkOut: formatMailDate(data.check_out),
      arrivalTime: formatArrivalTime(data.arrival_time),
      nights: formatNightsLabel(data.nights),
      guestTotal: data.guest_total ?? "",
      guestBreakdown: formatGuestBreakdownMail({
        adult_male: data.adult_male,
        adult_female: data.adult_female,
        boy_student: data.boy_student,
        girl_student: data.girl_student,
        age_3plus: data.age_3plus,
        under_3: data.under_3,
      }),
      bbq: formatBbqDisplayLabel(data.bbq),
      companionFormUrl: buildCompanionFormUrl(accessKey, appBase),
    };
  }

  if (entityType === "request" && entityId) {
    const { data } = await supabase
      .from("reservation_requests")
      .select(
        "request_id, linked_reservation_id, representative_name, last_name, first_name, name_kana, last_name_kana, first_name_kana, email, phone, check_in, check_out, nights, guest_total, reject_reason"
      )
      .eq("request_id", entityId)
      .maybeSingle();

    if (!data) return base;
    return {
      ...base,
      representativeName: data.representative_name ?? joinName(data.last_name, data.first_name),
      lastName: data.last_name ?? "",
      firstName: data.first_name ?? "",
      nameKana: data.name_kana ?? joinName(data.last_name_kana, data.first_name_kana),
      email: data.email ?? "",
      phone: data.phone ?? "",
      requestId: data.request_id,
      reservationId: data.linked_reservation_id ?? "",
      checkIn: formatMailDate(data.check_in),
      checkOut: formatMailDate(data.check_out),
      nights: formatNightsLabel(data.nights),
      guestTotal: data.guest_total ?? "",
      rejectReason: formatRejectReason(data.reject_reason),
    };
  }

  return base;
}
