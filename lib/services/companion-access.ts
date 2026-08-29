import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePreservedAccessKey } from "@/lib/utils/access-key";

export type CompanionReservationRow = {
  reservation_id: string;
  access_key: string | null;
  representative_name: string | null;
  check_in: string | null;
  check_out: string | null;
  guest_total: string | null;
  status: string;
  companion_form_answered: boolean;
  is_archived: boolean;
  request_id?: string | null;
};

const RESERVATION_SELECT =
  "reservation_id, access_key, representative_name, check_in, check_out, guest_total, status, companion_form_answered, is_archived, request_id";

function isUsableReservation(
  row: CompanionReservationRow | null | undefined
): row is CompanionReservationRow {
  return Boolean(row && !row.is_archived);
}

async function loadReservationById(
  supabase: SupabaseClient,
  reservationId: string
): Promise<CompanionReservationRow | null> {
  const { data, error } = await supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CompanionReservationRow | null) ?? null;
}

/** 予約側 access_key が欠落していれば、メール送信済みキーを復元する */
async function healReservationAccessKey(
  supabase: SupabaseClient,
  reservation: CompanionReservationRow,
  keyFromLink: string
): Promise<CompanionReservationRow> {
  const linkKey = keyFromLink.trim();
  const currentKey = String(reservation.access_key ?? "").trim();
  if (!linkKey || currentKey) return reservation;

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("reservations")
    .update({
      access_key: linkKey,
      updated_at: nowIso,
    })
    .eq("reservation_id", reservation.reservation_id);
  if (error) throw new Error(error.message);

  return { ...reservation, access_key: linkKey };
}

/** キャンセル/アーカイブ済み仮予約のキー → 付け替え先の本予約をたどる */
async function resolveViaStaleLinkedReservation(
  supabase: SupabaseClient,
  stale: CompanionReservationRow,
  key: string
): Promise<CompanionReservationRow | null> {
  const requestId = String(stale.request_id ?? "").trim();
  if (!requestId) return null;

  const { data: request, error } = await supabase
    .from("reservation_requests")
    .select("linked_reservation_id, is_archived")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (
    !request ||
    request.is_archived ||
    !request.linked_reservation_id ||
    String(request.linked_reservation_id) === stale.reservation_id
  ) {
    return null;
  }

  const linked = await loadReservationById(
    supabase,
    String(request.linked_reservation_id)
  );
  if (!isUsableReservation(linked)) return null;
  return healReservationAccessKey(supabase, linked, key);
}

/**
 * 同行者フォーム URL の access_key から予約を解決する。
 * 1. reservations.access_key（有効な予約）
 * 1b. キャンセル/アーカイブ済み予約のキー → RQ 経由で付け替え先本予約
 * 2. reservation_requests.access_key → linked_reservation_id
 * 3. companions.access_key → reservation_id
 */
export async function findReservationForCompanionAccessKey(
  supabase: SupabaseClient,
  rawKey: string
): Promise<CompanionReservationRow | null> {
  const key = rawKey.trim();
  if (!key) return null;

  const { data: direct, error: directError } = await supabase
    .from("reservations")
    .select(RESERVATION_SELECT)
    .eq("access_key", key)
    .maybeSingle();
  if (directError) throw new Error(directError.message);
  if (isUsableReservation(direct as CompanionReservationRow | null)) {
    return direct as CompanionReservationRow;
  }
  if (direct) {
    const viaSwitch = await resolveViaStaleLinkedReservation(
      supabase,
      direct as CompanionReservationRow,
      key
    );
    if (viaSwitch) return viaSwitch;
  }

  const { data: request, error: requestError } = await supabase
    .from("reservation_requests")
    .select("request_id, linked_reservation_id, access_key, is_archived")
    .eq("access_key", key)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (
    request &&
    !request.is_archived &&
    request.linked_reservation_id
  ) {
    const linked = await loadReservationById(
      supabase,
      String(request.linked_reservation_id)
    );
    if (isUsableReservation(linked)) {
      return healReservationAccessKey(supabase, linked, key);
    }
  }

  const { data: companionHit, error: companionError } = await supabase
    .from("companions")
    .select("reservation_id")
    .eq("access_key", key)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (companionError) throw new Error(companionError.message);
  if (companionHit?.reservation_id) {
    const linked = await loadReservationById(
      supabase,
      String(companionHit.reservation_id)
    );
    if (isUsableReservation(linked)) {
      return healReservationAccessKey(supabase, linked, key);
    }
  }

  return null;
}

/** 予約 ID + access_key の組み合わせを検証（送信時） */
export async function verifyCompanionAccessKey(
  supabase: SupabaseClient,
  accessKey: string
): Promise<
  | { ok: true; reservation: CompanionReservationRow }
  | { ok: false; message: string }
> {
  const key = accessKey.trim();
  if (!key) {
    return { ok: false, message: "リンクが無効です。" };
  }

  try {
    const reservation = await findReservationForCompanionAccessKey(supabase, key);
    if (!reservation) {
      return {
        ok: false,
        message: "予約が見つかりません。リンクをご確認ください。",
      };
    }
    if (reservation.status === "キャンセル") {
      return {
        ok: false,
        message: "この予約はキャンセル済みのため入力できません。",
      };
    }
    const resolvedKey = resolvePreservedAccessKey(reservation.access_key, key);
    if (resolvedKey !== key) {
      return { ok: false, message: "リンクが無効です。" };
    }
    return { ok: true, reservation };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
