"use server";

import { revalidatePath } from "next/cache";
import { nextRoomAssignmentId } from "@/lib/import/id-generation";
import { syncAssignmentStatus } from "@/lib/services/assignment-status";
import {
  checkRoomConflict,
  SHARED_ROOM_CONFIRM_MSG,
} from "@/lib/services/room-conflicts";
import { createClient } from "@/lib/supabase/server";

type ActionResult =
  | { ok: true; assignmentId?: string; needsConfirm?: false }
  | { ok: false; message: string; needsConfirm?: boolean };

function parseIntOrZero(value: FormDataEntryValue | null): number {
  const n = parseInt(String(value ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

function revalidateReservationPaths(reservationId: string) {
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${encodeURIComponent(reservationId)}`);
  revalidatePath("/rooms");
  revalidatePath("/");
}

export async function createRoomAssignmentAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const reservationId = String(formData.get("reservation_id") ?? "").trim();
  const roomId = String(formData.get("room_id") ?? "").trim();
  const stayStart = String(formData.get("stay_start") ?? "").trim();
  const stayEnd = String(formData.get("stay_end") ?? "").trim();
  const force = formData.get("force") === "true";

  if (!reservationId || !roomId || !stayStart || !stayEnd) {
    return { ok: false, message: "必須項目が不足しています。" };
  }

  const supabase = await createClient();

  const [{ data: reservation }, { data: room }] = await Promise.all([
    supabase
      .from("reservations")
      .select("reservation_id")
      .eq("reservation_id", reservationId)
      .maybeSingle(),
    supabase
      .from("rooms")
      .select("room_id, room_name")
      .eq("room_id", roomId)
      .maybeSingle(),
  ]);

  if (!reservation) return { ok: false, message: "予約が見つかりません。" };
  if (!room) return { ok: false, message: "部屋が見つかりません。" };

  const { data: duplicate } = await supabase
    .from("room_assignments")
    .select("room_assignment_id")
    .eq("reservation_id", reservationId)
    .eq("room_id", roomId)
    .eq("stay_start", stayStart)
    .eq("stay_end", stayEnd)
    .eq("is_archived", false)
    .maybeSingle();

  if (duplicate) {
    return { ok: true, assignmentId: duplicate.room_assignment_id };
  }

  const conflict = await checkRoomConflict(supabase, {
    roomId,
    startDate: stayStart,
    endDate: stayEnd,
    reservationId,
  });

  if (conflict.hasOtherReservationConflict && !force) {
    return {
      ok: false,
      needsConfirm: true,
      message: SHARED_ROOM_CONFIRM_MSG,
    };
  }

  const roomAssignmentId = await nextRoomAssignmentId(supabase);
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from("room_assignments").insert({
    room_assignment_id: roomAssignmentId,
    reservation_id: reservationId,
    room_id: roomId,
    room_name: room.room_name,
    stay_start: stayStart,
    stay_end: stayEnd,
    assigned_guest_count: parseIntOrZero(formData.get("assigned_guest_count")),
    male_count: parseIntOrZero(formData.get("male_count")),
    female_count: parseIntOrZero(formData.get("female_count")),
    child_count: parseIntOrZero(formData.get("child_count")),
    display_memo: String(formData.get("display_memo") ?? "").trim() || null,
    assignment_memo:
      String(formData.get("assignment_memo") ?? "").trim() || null,
    is_archived: false,
    sheet_created_at: nowIso,
    sheet_updated_at: nowIso,
    synced_at: nowIso,
    updated_at: nowIso,
  });

  if (error) return { ok: false, message: error.message };

  await syncAssignmentStatus(supabase, reservationId);
  revalidateReservationPaths(reservationId);
  return { ok: true, assignmentId: roomAssignmentId };
}

export async function updateRoomAssignmentAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const roomAssignmentId = String(
    formData.get("room_assignment_id") ?? ""
  ).trim();
  const force = formData.get("force") === "true";

  if (!roomAssignmentId) {
    return { ok: false, message: "部屋割りIDが不足しています。" };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("room_assignments")
    .select("*")
    .eq("room_assignment_id", roomAssignmentId)
    .maybeSingle();

  if (existingError) return { ok: false, message: existingError.message };
  if (!existing) return { ok: false, message: "部屋割りが見つかりません。" };

  const roomId = String(formData.get("room_id") ?? existing.room_id ?? "").trim();
  const stayStart = String(
    formData.get("stay_start") ?? existing.stay_start ?? ""
  ).trim();
  const stayEnd = String(
    formData.get("stay_end") ?? existing.stay_end ?? ""
  ).trim();

  const conflict = await checkRoomConflict(supabase, {
    roomId,
    startDate: stayStart,
    endDate: stayEnd,
    reservationId: existing.reservation_id,
    excludeAssignmentId: roomAssignmentId,
  });

  if (conflict.hasOtherReservationConflict && !force) {
    return {
      ok: false,
      needsConfirm: true,
      message: SHARED_ROOM_CONFIRM_MSG,
    };
  }

  let roomName = existing.room_name;
  if (roomId !== existing.room_id) {
    const { data: room } = await supabase
      .from("rooms")
      .select("room_name")
      .eq("room_id", roomId)
      .maybeSingle();
    if (!room) return { ok: false, message: "部屋が見つかりません。" };
    roomName = room.room_name;
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("room_assignments")
    .update({
      room_id: roomId,
      room_name: roomName,
      stay_start: stayStart,
      stay_end: stayEnd,
      assigned_guest_count: parseIntOrZero(
        formData.get("assigned_guest_count")
      ),
      male_count: parseIntOrZero(formData.get("male_count")),
      female_count: parseIntOrZero(formData.get("female_count")),
      child_count: parseIntOrZero(formData.get("child_count")),
      display_memo: String(formData.get("display_memo") ?? "").trim() || null,
      assignment_memo:
        String(formData.get("assignment_memo") ?? "").trim() || null,
      updated_at: nowIso,
      sheet_updated_at: nowIso,
    })
    .eq("room_assignment_id", roomAssignmentId);

  if (error) return { ok: false, message: error.message };

  await syncAssignmentStatus(supabase, existing.reservation_id);
  revalidateReservationPaths(existing.reservation_id);
  return { ok: true, assignmentId: roomAssignmentId };
}

export async function moveRoomAssignmentAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const roomAssignmentId = String(
    formData.get("room_assignment_id") ?? ""
  ).trim();
  const newRoomId = String(formData.get("new_room_id") ?? "").trim();
  const force = formData.get("force") === "true";

  if (!roomAssignmentId || !newRoomId) {
    return { ok: false, message: "必須項目が不足しています。" };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("room_assignments")
    .select("*")
    .eq("room_assignment_id", roomAssignmentId)
    .maybeSingle();

  if (existingError) return { ok: false, message: existingError.message };
  if (!existing) return { ok: false, message: "部屋割りが見つかりません。" };
  if (existing.room_id === newRoomId) return { ok: true };

  const conflict = await checkRoomConflict(supabase, {
    roomId: newRoomId,
    startDate: existing.stay_start,
    endDate: existing.stay_end,
    reservationId: existing.reservation_id,
    excludeAssignmentId: roomAssignmentId,
  });

  if (conflict.hasOtherReservationConflict && !force) {
    return {
      ok: false,
      needsConfirm: true,
      message: SHARED_ROOM_CONFIRM_MSG,
    };
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("room_name")
    .eq("room_id", newRoomId)
    .maybeSingle();
  if (!room) return { ok: false, message: "部屋が見つかりません。" };

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("room_assignments")
    .update({
      room_id: newRoomId,
      room_name: room.room_name,
      updated_at: nowIso,
      sheet_updated_at: nowIso,
    })
    .eq("room_assignment_id", roomAssignmentId);

  if (error) return { ok: false, message: error.message };

  revalidateReservationPaths(existing.reservation_id);
  return { ok: true, assignmentId: roomAssignmentId };
}

export async function deleteRoomAssignmentAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const roomAssignmentId = String(
    formData.get("room_assignment_id") ?? ""
  ).trim();
  if (!roomAssignmentId) {
    return { ok: false, message: "部屋割りIDが不足しています。" };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("room_assignments")
    .select("reservation_id")
    .eq("room_assignment_id", roomAssignmentId)
    .maybeSingle();

  if (!existing) return { ok: false, message: "部屋割りが見つかりません。" };

  const { error } = await supabase
    .from("room_assignments")
    .delete()
    .eq("room_assignment_id", roomAssignmentId);

  if (error) return { ok: false, message: error.message };

  await syncAssignmentStatus(supabase, existing.reservation_id);
  revalidateReservationPaths(existing.reservation_id);
  return { ok: true };
}
