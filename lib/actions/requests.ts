"use server";

import {
  revalidateRequestDetail,
  revalidateRequestMailFlags,
  revalidateRequestStatus,
  revalidateReservationDetail,
  revalidateReservationsList,
} from "@/lib/cache/revalidate";
import {
  normalizeRequestStatus,
  REQUEST_WORKFLOW_STATUSES,
} from "@/lib/domain/request-status";
import {
  applyRequestLinkAfterStatusChange,
  linkRequestToReservation,
  statusAllowsProvisional,
  unlinkRequestFromReservation,
} from "@/lib/services/request-reservation-link";
import {
  createProvisionalForRequest,
  deleteLinkedProvisionalIfAny,
} from "@/lib/actions/request-provisional";
import { createStaffClient } from "@/lib/supabase/server";
import { updateRowWithLock } from "@/lib/utils/optimistic-lock";

type UpdateResult = { ok: true } | { ok: false; message: string; conflict?: boolean };

function revalidateRequestPaths(requestId: string, reservationId?: string | null) {
  revalidateRequestDetail(requestId);
  revalidateReservationsList();
  if (reservationId) {
    revalidateReservationDetail(reservationId);
  }
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

export async function updateRequestAction(
  _prevState: UpdateResult,
  formData: FormData
): Promise<UpdateResult> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const rawStatus = String(formData.get("status") ?? "").trim();
  const internalMemo = String(formData.get("internal_memo") ?? "").trim();
  const linkedReservationId = String(
    formData.get("linked_reservation_id") ?? ""
  ).trim();

  if (!requestId) {
    return { ok: false, message: "リクエストIDが不足しています。" };
  }

  const status = normalizeRequestStatus(rawStatus);
  if (!status) {
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

  const previousLinked = (current.linked_reservation_id as string | null) ?? null;
  let nextLinked = linkedReservationId || previousLinked;
  const createProvisional = formData.get("create_provisional") === "true";

  if (status === "リクエスト" || status === "却下") {
    // 差し戻し・却下: 仮予約なら削除、確定本予約ならリンク解除
    nextLinked = await deleteLinkedProvisionalIfAny(
      supabase,
      requestId,
      previousLinked
    );
    if (nextLinked) {
      nextLinked = null;
    }
  }

  if (status === "承認済" && !nextLinked && createProvisional) {
    const created = await createProvisionalForRequest(supabase, current);
    if (!created.ok) return { ok: false, message: created.message };
    nextLinked = created.provisionalId;
  }

  const payload: Record<string, unknown> = {
    status,
    reject_reason: null,
    internal_memo: internalMemo || null,
    linked_reservation_id: nextLinked,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("reservation_requests")
    .update(payload)
    .eq("request_id", requestId);

  if (error) {
    return { ok: false, message: error.message };
  }

  const sync = await applyRequestLinkAfterStatusChange(supabase, {
    requestId,
    previousLinkedId: previousLinked,
    nextLinkedId: nextLinked,
    accessKey: (current.access_key as string | null) ?? null,
  });
  if (!sync.ok) return { ok: false, message: sync.message };

  revalidateRequestPaths(requestId, nextLinked ?? previousLinked);
  return { ok: true };
}

export async function quickRequestStatusAction(
  _prev: UpdateResult,
  formData: FormData
): Promise<UpdateResult> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const rawStatus = String(formData.get("status") ?? "").trim();
  const expectedUpdatedAt =
    String(formData.get("expected_updated_at") ?? "").trim() || null;

  if (!requestId) return { ok: false, message: "リクエストIDが不足しています。" };
  const status = normalizeRequestStatus(rawStatus);
  if (!status || !(REQUEST_WORKFLOW_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, message: "ステータスが不正です。" };
  }

  const createProvisional = formData.get("create_provisional") === "true";

  const { current, error: loadError } = await loadRequest(requestId);
  if (loadError || !current) return { ok: false, message: loadError || "不明なエラー" };

  const supabase = await createStaffClient();
  const previousLinked = (current.linked_reservation_id as string | null) ?? null;
  let nextLinked = previousLinked;

  if (status === "リクエスト" || status === "却下") {
    nextLinked = await deleteLinkedProvisionalIfAny(
      supabase,
      requestId,
      previousLinked
    );
    if (nextLinked) nextLinked = null;
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

  const sync = await applyRequestLinkAfterStatusChange(supabase, {
    requestId,
    previousLinkedId: previousLinked,
    nextLinkedId: nextLinked,
    accessKey: (current.access_key as string | null) ?? null,
  });
  if (!sync.ok) return { ok: false, message: sync.message };

  if (nextLinked !== previousLinked) {
    revalidateRequestPaths(requestId, nextLinked ?? previousLinked);
  } else {
    revalidateRequestStatus(requestId);
  }
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

  if (!statusAllowsProvisional(String(current.status ?? ""))) {
    return { ok: false, message: "仮予約を作成できるのは承認済のリクエストのみです。" };
  }
  if (current.linked_reservation_id) {
    return { ok: false, message: "仮予約は既に作成済みです。" };
  }

  const supabase = await createStaffClient();
  const created = await createProvisionalForRequest(supabase, current);
  if (!created.ok) return { ok: false, message: created.message };

  const previousLinked = null;
  const nextLinked = created.provisionalId;
  const { error } = await supabase
    .from("reservation_requests")
    .update({
      linked_reservation_id: nextLinked,
      status: "承認済",
      updated_at: new Date().toISOString(),
    })
    .eq("request_id", requestId);
  if (error) return { ok: false, message: error.message };

  const sync = await applyRequestLinkAfterStatusChange(supabase, {
    requestId,
    previousLinkedId: previousLinked,
    nextLinkedId: nextLinked,
    accessKey: (current.access_key as string | null) ?? null,
  });
  if (!sync.ok) return { ok: false, message: sync.message };

  revalidateRequestPaths(requestId, nextLinked);
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
  const result = await unlinkRequestFromReservation(supabase, {
    requestId,
    linkedReservationId: linkedId,
    keepStatus: "承認済",
  });
  if (!result.ok) return { ok: false, message: result.message };

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
  const result = await linkRequestToReservation(supabase, {
    requestId,
    reservationId,
    accessKey: (current.access_key as string | null) ?? null,
    currentStatus: String(current.status ?? ""),
    currentLinkedId: (current.linked_reservation_id as string | null) ?? null,
  });
  if (!result.ok) return { ok: false, message: result.message };

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

  revalidateRequestMailFlags(requestId);
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
