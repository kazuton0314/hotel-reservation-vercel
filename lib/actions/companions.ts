"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; message: string };

const GENDER_OPTIONS = ["男性", "女性", "その他", "回答しない"] as const;

export async function addCompanionAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();

  if (!reservationId || !name) {
    return { ok: false, message: "予約IDと氏名は必須です。" };
  }
  if (gender && !GENDER_OPTIONS.includes(gender as (typeof GENDER_OPTIONS)[number])) {
    return { ok: false, message: "性別が不正です。" };
  }

  const supabase = await createClient();
  const { data: reservation, error: resError } = await supabase
    .from("reservations")
    .select("reservation_id, access_key")
    .eq("reservation_id", reservationId)
    .maybeSingle();

  if (resError) return { ok: false, message: resError.message };
  if (!reservation) return { ok: false, message: "予約が見つかりません。" };

  const { data: existing } = await supabase
    .from("companions")
    .select("entry_no")
    .eq("reservation_id", reservationId)
    .order("entry_no", { ascending: false })
    .limit(1);

  const nextEntryNo = (existing?.[0]?.entry_no ?? 0) + 1;
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from("companions").insert({
    access_key: reservation.access_key,
    reservation_id: reservationId,
    answered_at: nowIso,
    entry_no: nextEntryNo,
    name,
    name_kana: String(formData.get("name_kana") ?? "").trim() || null,
    age: String(formData.get("age") ?? "").trim() || null,
    gender: gender || null,
    source: "手動",
    updated_at: nowIso,
  });

  if (error) return { ok: false, message: error.message };

  await supabase
    .from("reservations")
    .update({
      companion_form_answered: true,
      updated_at: nowIso,
    })
    .eq("reservation_id", reservationId);

  revalidatePath(`/reservations/${encodeURIComponent(reservationId)}`);
  return { ok: true };
}

export async function deleteCompanionAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const id = String(formData.get("companion_id") ?? "").trim();
  const reservationId = String(formData.get("reservation_id") ?? "").trim();

  if (!id || !reservationId) {
    return { ok: false, message: "IDが不足しています。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("companions").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };

  const { count } = await supabase
    .from("companions")
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", reservationId);

  if ((count ?? 0) === 0) {
    await supabase
      .from("reservations")
      .update({
        companion_form_answered: false,
        updated_at: new Date().toISOString(),
      })
      .eq("reservation_id", reservationId);
  }

  revalidatePath(`/reservations/${encodeURIComponent(reservationId)}`);
  return { ok: true };
}
