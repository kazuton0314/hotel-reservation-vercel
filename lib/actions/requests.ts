"use server";

import {
  revalidateRequestDetail,
  revalidateReservationDetail,
  revalidateReservationsList,
} from "@/lib/cache/revalidate";
import { createStaffClient } from "@/lib/supabase/server";
import { REQUEST_STATUS_OPTIONS } from "@/lib/queries/requests";
import {
  createProvisionalForRequest,
  deleteLinkedProvisionalIfAny,
} from "@/lib/actions/request-provisional";
import { updateRowWithLock } from "@/lib/utils/optimistic-lock";

type UpdateResult = { ok: true } | { ok: false; message: string; conflict?: boolean };

export async function updateRequestAction(
  _prevState: UpdateResult,
  formData: FormData
): Promise<UpdateResult> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
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

  const supabase = await createStaffClient();
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
  const createProvisional = formData.get("create_provisional") === "true";

  if (status === "リクエスト") {
    nextLinkedReservationId = await deleteLinkedProvisionalIfAny(
      supabase,
      requestId,
      (current.linked_reservation_id as string | null) ?? nextLinkedReservationId
    );
  }

  if (
    status === "承認済" &&
    !nextLinkedReservationId &&
    createProvisional
  ) {
    const created = await createProvisionalForRequest(supabase, current);
    if (!created.ok) return { ok: false, message: created.message };
    nextLinkedReservationId = created.provisionalId;
  }

  // 連携済ステータスは予約ID必須
  if (status === "本予約連携済" && !nextLinkedReservationId) {
    return { ok: false, message: "本予約連携済にする場合は連携予約IDが必要です。" };
  }
  const payload: Record<string, unknown> = {
    status,
    reject_reason: null,
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

  revalidateRequestDetail(requestId);
  revalidateReservationsList();
  if (nextLinkedReservationId) {
    revalidateReservationDetail(nextLinkedReservationId);
  }
  return { ok: true };
}

async function loadRequest(requestId: string) {
  const supabase = await createStaffClient();
  const { data, error } = await supabase
    .from("reservation_requests")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) return { error: error.message, current: null };
  if (!data) return { error: "対象リクエストが見つかりません。", current: null };
  return { error: null, current: data };
}

function revalidateRequestPaths(requestId: string, reservationId?: string | null) {
  revalidateRequestDetail(requestId);
  revalidateReservationsList();
  if (reservationId) {
    revalidateReservationDetail(reservationId);
  }
}

export async function quickRequestStatusAction(
  _prev: UpdateResult,
  formData: FormData
): Promise<UpdateResult> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const expectedUpdatedAt =
    String(formData.get("expected_updated_at") ?? "").trim() || null;

  if (!requestId) return { ok: false, message: "リクエストIDが不足しています。" };
  if (!REQUEST_STATUS_OPTIONS.includes(status as (typeof REQUEST_STATUS_OPTIONS)[number])) {
    return { ok: false, message: "ステータスが不正です。" };
  }

  const createProvisional = formData.get("create_provisional") === "true";

  const { current, error: loadError } = await loadRequest(requestId);
  if (loadError || !current) return { ok: false, message: loadError || "不明なエラー" };

  const supabase = await createStaffClient();
  let nextLinked = current.linked_reservation_id as string | null;

  if (status === "リクエスト") {
    nextLinked = await deleteLinkedProvisionalIfAny(
      supabase,
      requestId,
      nextLinked
    );
  }

  if (status === "承認済" && !nextLinked && createProvisional) {
    const created = await createProvisionalForRequest(supabase, current);
    if (!created.ok) return { ok: false, message: created.message };
    nextLinked = created.provisionalId;
  }

  const payload: Record<string, unknown> = {
    status,
    reject_reason: null,
    linked_reservation_id: nextLinked,
    updated_at: new Date().toISOString(),
  };
  if (status === "リクエスト") {
    payload.reject_reason = null;
  }

  const updateResult = await updateRowWithLock<Record<string, unknown>>({
    supabase,
    table: "reservation_requests",
    idColumn: "request_id",
    idValue: requestId,
    expectedUpdatedAt,
    patch: payload,
  });
  if (!updateResult.ok) {
    return {
      ok: false,
      message: updateResult.message,
      conflict: updateResult.conflict,
    };
  }

  if (nextLinked) {
    const { error: linkError } = await supabase
      .from("reservations")
      .update({
        request_id: requestId,
        access_key: current.access_key || null,
        updated_at: new Date().toISOString(),
      })
      .eq("reservation_id", nextLinked);
    if (linkError) return { ok: false, message: linkError.message };
  }

  revalidateRequestPaths(requestId, nextLinked);
  return { ok: true };
}

export async function createProvisionalFromRequestAction(
  _prev: UpdateResult,
  formData: FormData
): Promise<UpdateResult> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  if (!requestId) return { ok: false, message: "リクエストIDが不足しています。" };

  const { current, error: loadError } = await loadRequest(requestId);
  if (loadError || !current) return { ok: false, message: loadError || "不明なエラー" };

  const status = String(current.status ?? "");
  if (status !== "承認済" && status !== "本予約連携済") {
    return { ok: false, message: "仮予約を作成できるのは承認済のリクエストのみです。" };
  }
  if (current.linked_reservation_id) {
    return { ok: false, message: "仮予約は既に作成済みです。" };
  }

  const provisionalId = String(current.request_id);
  const supabase = await createStaffClient();
  const created = await createProvisionalForRequest(supabase, current);
  if (!created.ok) return { ok: false, message: created.message };

  const { error } = await supabase
    .from("reservation_requests")
    .update({
      linked_reservation_id: provisionalId,
      updated_at: new Date().toISOString(),
    })
    .eq("request_id", requestId);
  if (error) return { ok: false, message: error.message };

  revalidateRequestPaths(requestId, provisionalId);
  return { ok: true };
}

export async function unlinkRequestReservationAction(
  _prev: UpdateResult,
  formData: FormData
): Promise<UpdateResult> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  if (!requestId) return { ok: false, message: "リクエストIDが不足しています。" };

  const { current, error: loadError } = await loadRequest(requestId);
  if (loadError || !current) return { ok: false, message: loadError || "不明なエラー" };
  if (!current.linked_reservation_id) {
    return { ok: false, message: "連携されている予約がありません。" };
  }

  const linkedId = String(current.linked_reservation_id);
  const supabase = await createStaffClient();
  const { error } = await supabase
    .from("reservation_requests")
    .update({
      linked_reservation_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("request_id", requestId);
  if (error) return { ok: false, message: error.message };

  revalidateRequestPaths(requestId, linkedId);
  return { ok: true };
}

export async function linkRequestReservationAction(
  _prev: UpdateResult,
  formData: FormData
): Promise<UpdateResult> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  if (!requestId || !reservationId) {
    return { ok: false, message: "リクエストIDと予約IDが必要です。" };
  }

  const { current, error: loadError } = await loadRequest(requestId);
  if (loadError || !current) return { ok: false, message: loadError || "不明なエラー" };

  const supabase = await createStaffClient();
  const { data: reservation, error: resError } = await supabase
    .from("reservations")
    .select("reservation_id")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (resError) return { ok: false, message: resError.message };
  if (!reservation) return { ok: false, message: "指定の本予約が見つかりません。" };

  const nextStatus =
    current.status === "リクエスト" || current.status === "却下"
      ? "本予約連携済"
      : String(current.status ?? "本予約連携済");

  const { error } = await supabase
    .from("reservation_requests")
    .update({
      status: nextStatus,
      linked_reservation_id: reservationId,
      updated_at: new Date().toISOString(),
    })
    .eq("request_id", requestId);
  if (error) return { ok: false, message: error.message };

  const { error: linkError } = await supabase
    .from("reservations")
    .update({
      request_id: requestId,
      access_key: current.access_key || null,
      updated_at: new Date().toISOString(),
    })
    .eq("reservation_id", reservationId);
  if (linkError) return { ok: false, message: linkError.message };

  revalidateRequestPaths(requestId, reservationId);
  return { ok: true };
}

export async function updateRequestReplyMailAction(
  _prev: UpdateResult,
  formData: FormData
): Promise<UpdateResult> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const sent = formData.get("reply_email_sent") === "true";
  if (!requestId) return { ok: false, message: "リクエストIDが不足しています。" };

  const supabase = await createStaffClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("reservation_requests")
    .update({
      reply_email_sent: sent,
      reply_email_sent_at: sent ? nowIso : null,
      updated_at: nowIso,
    })
    .eq("request_id", requestId);
  if (error) return { ok: false, message: error.message };

  revalidateRequestPaths(requestId);
  return { ok: true };
}

type ActionResult = { ok: true } | { ok: false; message: string };

export async function archiveRequestAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const archive = formData.get("archive") === "true";

  if (!requestId) {
    return { ok: false, message: "リクエストIDが不足しています。" };
  }

  const supabase = await createStaffClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("reservation_requests")
    .update({
      is_archived: archive,
      updated_at: nowIso,
      sheet_updated_at: nowIso,
    })
    .eq("request_id", requestId);

  if (error) return { ok: false, message: error.message };

  revalidateRequestPaths(requestId);
  return { ok: true };
}
