import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isApprovedRequestStatus,
  normalizeRequestStatus,
  type RequestWorkflowStatus,
} from "@/lib/domain/request-status";
import { resolvePreservedAccessKey } from "@/lib/utils/access-key";

export type LinkOpResult = { ok: true } | { ok: false; message: string };

/**
 * リクエスト↔本予約の双方向リンクを同期する。
 * 真実は request.linked_reservation_id。reservations.request_id は追随。
 * previous → next で差し替わる場合、旧予約側の request_id を外す。
 */
export async function syncBidirectionalRequestLink(
  supabase: SupabaseClient,
  opts: {
    requestId: string;
    previousLinkedId: string | null;
    nextLinkedId: string | null;
    accessKey?: string | null;
  }
): Promise<LinkOpResult> {
  const { requestId, previousLinkedId, nextLinkedId, accessKey } = opts;
  const nowIso = new Date().toISOString();

  if (previousLinkedId && previousLinkedId !== nextLinkedId) {
    const { error } = await supabase
      .from("reservations")
      .update({ request_id: null, updated_at: nowIso })
      .eq("reservation_id", previousLinkedId)
      .eq("request_id", requestId);
    if (error) return { ok: false, message: error.message };
  }

  if (nextLinkedId) {
    const { data: target, error: fetchError } = await supabase
      .from("reservations")
      .select("access_key")
      .eq("reservation_id", nextLinkedId)
      .maybeSingle();
    if (fetchError) return { ok: false, message: fetchError.message };
    if (!target) {
      return { ok: false, message: "指定の本予約が見つかりません。" };
    }

    const preservedKey = resolvePreservedAccessKey(
      target.access_key as string | null | undefined,
      accessKey
    );
    const updatePayload: Record<string, unknown> = {
      request_id: requestId,
      updated_at: nowIso,
    };
    // メール等で発行済みのキーを null や別キーで上書きしない
    if (!String(target.access_key ?? "").trim() && preservedKey) {
      updatePayload.access_key = preservedKey;
    }

    const { error } = await supabase
      .from("reservations")
      .update(updatePayload)
      .eq("reservation_id", nextLinkedId)
      .or(`request_id.is.null,request_id.eq.${requestId}`);
    if (error) return { ok: false, message: error.message };
  }

  return { ok: true };
}

/** リンク設定（RQ status も承認済へ。linked を真実として両側更新） */
export async function linkRequestToReservation(
  supabase: SupabaseClient,
  opts: {
    requestId: string;
    reservationId: string;
    accessKey?: string | null;
    currentStatus?: string | null;
    currentLinkedId?: string | null;
  }
): Promise<LinkOpResult> {
  const {
    requestId,
    reservationId,
    accessKey,
    currentStatus,
    currentLinkedId = null,
  } = opts;
  const nowIso = new Date().toISOString();

  const { data: reservation, error: resError } = await supabase
    .from("reservations")
    .select("reservation_id, request_id, status")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (resError) return { ok: false, message: resError.message };
  if (!reservation) return { ok: false, message: "指定の本予約が見つかりません。" };
  if (reservation.status === "キャンセル") {
    return { ok: false, message: "キャンセル済みの本予約には連携できません。" };
  }
  if (reservation.request_id && reservation.request_id !== requestId) {
    return {
      ok: false,
      message: `この本予約は既に ${reservation.request_id} と連携済みです。`,
    };
  }
  if (currentLinkedId && currentLinkedId !== reservationId) {
    return {
      ok: false,
      message: `このリクエストは既に ${currentLinkedId} と連携済みです。`,
    };
  }

  const nextStatus: RequestWorkflowStatus = "承認済";

  const { error: reqError } = await supabase
    .from("reservation_requests")
    .update({
      status: nextStatus,
      linked_reservation_id: reservationId,
      updated_at: nowIso,
    })
    .eq("request_id", requestId)
    .or(
      `linked_reservation_id.is.null,linked_reservation_id.eq.${reservationId}`
    );
  if (reqError) return { ok: false, message: reqError.message };

  const sync = await syncBidirectionalRequestLink(supabase, {
    requestId,
    previousLinkedId: currentLinkedId,
    nextLinkedId: reservationId,
    accessKey,
  });
  if (!sync.ok) {
    await supabase
      .from("reservation_requests")
      .update({
        linked_reservation_id: currentLinkedId,
        status: normalizeRequestStatus(currentStatus) ?? currentStatus,
        updated_at: nowIso,
      })
      .eq("request_id", requestId);
    return sync;
  }

  return { ok: true };
}

/** リンク解除（status は承認済のまま。連携事実だけ消す） */
export async function unlinkRequestFromReservation(
  supabase: SupabaseClient,
  opts: {
    requestId: string;
    linkedReservationId: string;
    keepStatus?: RequestWorkflowStatus;
  }
): Promise<LinkOpResult> {
  const { requestId, linkedReservationId, keepStatus = "承認済" } = opts;
  const nowIso = new Date().toISOString();

  const { error: reqError } = await supabase
    .from("reservation_requests")
    .update({
      linked_reservation_id: null,
      status: keepStatus,
      updated_at: nowIso,
    })
    .eq("request_id", requestId);
  if (reqError) return { ok: false, message: reqError.message };

  const sync = await syncBidirectionalRequestLink(supabase, {
    requestId,
    previousLinkedId: linkedReservationId,
    nextLinkedId: null,
  });
  return sync;
}

/** ステータス更新後の linked 追随（差し替え・解除を含む） */
export async function applyRequestLinkAfterStatusChange(
  supabase: SupabaseClient,
  opts: {
    requestId: string;
    previousLinkedId: string | null;
    nextLinkedId: string | null;
    accessKey?: string | null;
  }
): Promise<LinkOpResult> {
  const { previousLinkedId, nextLinkedId } = opts;
  if (previousLinkedId === nextLinkedId) {
    if (!nextLinkedId) return { ok: true };
    // 同じ ID でも request_id 欠落の修復
    return syncBidirectionalRequestLink(supabase, opts);
  }
  return syncBidirectionalRequestLink(supabase, opts);
}

export function statusAllowsProvisional(
  status: string | null | undefined
): boolean {
  return isApprovedRequestStatus(status);
}
