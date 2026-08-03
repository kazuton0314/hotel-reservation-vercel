"use server";

import { MAX_COMPANION_ENTRIES } from "@/lib/config/companions";
import { revalidateReservationCompanions } from "@/lib/cache/revalidate";
import {
  normalizeCompanionAgeInput,
  validateCompanionAge,
} from "@/lib/utils/companion-age";
import { createAdminClient } from "@/lib/supabase/server";

export type PublicCompanionSubmitResult =
  | { ok: true; count: number }
  | { ok: false; message: string };

const GENDER_OPTIONS = ["男性", "女性", "その他", "回答しない"] as const;

export async function getReservationByAccessKey(accessKey: string) {
  const key = accessKey.trim();
  if (!key) return { reservation: null, error: null };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "reservation_id, access_key, representative_name, check_in, check_out, guest_total, status, companion_form_answered, is_archived"
    )
    .eq("access_key", key)
    .maybeSingle();

  if (error) return { reservation: null, error: error.message };
  if (!data || data.is_archived) return { reservation: null, error: null };
  return { reservation: data, error: null };
}

export async function submitCompanionsPublicAction(
  _prev: PublicCompanionSubmitResult,
  formData: FormData
): Promise<PublicCompanionSubmitResult> {
  const accessKey = String(formData.get("access_key") ?? "").trim();
  const names = formData.getAll("name").map((v) => String(v).trim()).filter(Boolean);
  const kanaList = formData.getAll("name_kana").map((v) => String(v).trim());
  const ageList = formData.getAll("age").map((v) => String(v).trim());
  const genderList = formData.getAll("gender").map((v) => String(v).trim());

  if (!accessKey) return { ok: false, message: "リンクが無効です。" };
  if (!names.length) return { ok: false, message: "同行者の氏名を1名以上入力してください。" };

  const supabase = createAdminClient();
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("reservation_id, access_key, status, is_archived")
    .eq("access_key", accessKey)
    .maybeSingle();

  if (reservationError) return { ok: false, message: reservationError.message };
  if (!reservation || reservation.is_archived) {
    return { ok: false, message: "予約が見つかりません。リンクをご確認ください。" };
  }
  if (reservation.status === "キャンセル") {
    return { ok: false, message: "この予約はキャンセル済みのため入力できません。" };
  }

  const { count: existingCount } = await supabase
    .from("companions")
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", reservation.reservation_id);

  if ((existingCount ?? 0) + names.length > MAX_COMPANION_ENTRIES) {
    return {
      ok: false,
      message: `同行者は最大${MAX_COMPANION_ENTRIES}名までです。`,
    };
  }

  const { data: existing } = await supabase
    .from("companions")
    .select("entry_no")
    .eq("reservation_id", reservation.reservation_id)
    .order("entry_no", { ascending: false })
    .limit(1);

  let nextEntryNo = (existing?.[0]?.entry_no ?? 0) + 1;
  const nowIso = new Date().toISOString();
  const rows: {
    reservation_id: string;
    access_key: string;
    entry_no: number;
    name: string;
    name_kana: string | null;
    age: string | null;
    gender: string | null;
    source: string;
    answered_at: string;
    updated_at: string;
  }[] = [];

  for (let idx = 0; idx < names.length; idx++) {
    const gender = genderList[idx] ?? "";
    if (gender && !GENDER_OPTIONS.includes(gender as (typeof GENDER_OPTIONS)[number])) {
      return { ok: false, message: "性別が不正です。" };
    }
    const ageRaw = ageList[idx] ?? "";
    if (ageRaw) {
      const ageError = validateCompanionAge(ageRaw);
      if (ageError) return { ok: false, message: ageError };
    }
    rows.push({
      reservation_id: reservation.reservation_id,
      access_key: accessKey,
      entry_no: nextEntryNo++,
      name: names[idx],
      name_kana: kanaList[idx] || null,
      age: ageRaw ? normalizeCompanionAgeInput(ageRaw) : null,
      gender: gender || null,
      source: "ゲスト入力",
      answered_at: nowIso,
      updated_at: nowIso,
    });
  }

  const { error: insertError } = await supabase.from("companions").insert(rows);
  if (insertError) return { ok: false, message: insertError.message };

  await supabase
    .from("reservations")
    .update({
      companion_form_answered: true,
      updated_at: nowIso,
    })
    .eq("reservation_id", reservation.reservation_id);

  revalidateReservationCompanions(reservation.reservation_id);
  return { ok: true, count: rows.length };
}
