"use server";

import { after } from "next/server";
import { revalidateReservationDetail } from "@/lib/cache/revalidate";
import { nextRoomAssignmentId } from "@/lib/import/id-generation";
import { syncAssignmentStatus } from "@/lib/services/assignment-status";
import { syncReservationToGCal } from "@/lib/services/gcal-sync";
import {
  checkRoomConflict,
  SHARED_ROOM_CONFIRM_MSG,
} from "@/lib/services/room-conflicts";
import { createAdminClient, createStaffClient } from "@/lib/supabase/server";
import { CONFLICT_MESSAGE } from "@/lib/utils/optimistic-lock";

type ActionResult =
  | { ok: true; assignmentId?: string; needsConfirm?: false }
  | { ok: false; message: string; needsConfirm?: boolean };

function parseIntOrZero(value: FormDataEntryValue | null): number {
  const n = parseInt(String(value ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

function revalidateReservationPaths(reservationId: string) {
  revalidateReservationDetail(reservationId);
  after(async () => {
    const admin = createAdminClient();
    await syncReservationToGCal(admin, reservationId);
  });
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

  const supabase = await createStaffClient();

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

  const boyStudent = parseIntOrZero(formData.get("boy_student_count"));
  const girlStudent = parseIntOrZero(formData.get("girl_student_count"));
  const age3plus = parseIntOrZero(formData.get("age_3plus_count"));
  const under3 = parseIntOrZero(formData.get("under_3_count"));
  const childCount =
    parseIntOrZero(formData.get("child_count")) ||
    boyStudent + girlStudent + age3plus + under3;

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
    child_count: childCount,
    boy_student_count: boyStudent,
    girl_student_count: girlStudent,
    age_3plus_count: age3plus,
    under_3_count: under3,
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

  const supabase = await createStaffClient();
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

  const boyStudent = parseIntOrZero(formData.get("boy_student_count"));
  const girlStudent = parseIntOrZero(formData.get("girl_student_count"));
  const age3plus = parseIntOrZero(formData.get("age_3plus_count"));
  const under3 = parseIntOrZero(formData.get("under_3_count"));
  const childCount =
    parseIntOrZero(formData.get("child_count")) ||
    boyStudent + girlStudent + age3plus + under3;

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
      child_count: childCount,
      boy_student_count: boyStudent,
      girl_student_count: girlStudent,
      age_3plus_count: age3plus,
      under_3_count: under3,
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

  const supabase = await createStaffClient();
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

  await syncAssignmentStatus(supabase, existing.reservation_id);
  revalidateReservationPaths(existing.reservation_id);
  return { ok: true, assignmentId: roomAssignmentId };
}

export type BatchRoomAssignmentResult =
  | {
      ok: true;
      applied: number;
      affectedReservationIds: string[];
    }
  | { ok: false; message: string; needsConfirm?: boolean };

export type RoomAssignmentBatchChange =
  | {
      type: "move";
      roomAssignmentId: string;
      toRoomId: string;
      reservationId: string;
      expectedUpdatedAt?: string | null;
    }
  | {
      type: "assign";
      reservationId: string;
      payload: {
        reservationId: string;
        roomId: string;
        startDate: string;
        endDate: string;
        guestCount: number;
        maleCount: number;
        femaleCount: number;
        boyStudent: number;
        girlStudent: number;
        age3plus: number;
        under3: number;
        childCount: number;
      };
    }
  | {
      type: "unassign";
      roomAssignmentId: string;
      reservationId: string;
      expectedUpdatedAt?: string | null;
    };

export async function batchRoomAssignmentChangesAction(
  changes: RoomAssignmentBatchChange[],
  force = false
): Promise<BatchRoomAssignmentResult> {
  if (!changes.length) {
    return { ok: true, applied: 0, affectedReservationIds: [] };
  }

  const supabase = await createStaffClient();
  const affected = new Set<string>();
  let applied = 0;

  for (const ch of changes) {
    if (ch.type === "move") {
      const { data: existing, error: existingError } = await supabase
        .from("room_assignments")
        .select("*")
        .eq("room_assignment_id", ch.roomAssignmentId)
        .maybeSingle();

      if (existingError) return { ok: false, message: existingError.message };
      if (!existing) return { ok: false, message: "部屋割りが見つかりません。" };
      if (existing.room_id === ch.toRoomId) {
        applied++;
        affected.add(ch.reservationId);
        continue;
      }

      const conflict = await checkRoomConflict(supabase, {
        roomId: ch.toRoomId,
        startDate: existing.stay_start,
        endDate: existing.stay_end,
        reservationId: existing.reservation_id,
        excludeAssignmentId: ch.roomAssignmentId,
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
        .eq("room_id", ch.toRoomId)
        .maybeSingle();
      if (!room) return { ok: false, message: "部屋が見つかりません。" };

      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("room_assignments")
        .update({
          room_id: ch.toRoomId,
          room_name: room.room_name,
          updated_at: nowIso,
          sheet_updated_at: nowIso,
        })
        .eq("room_assignment_id", ch.roomAssignmentId)
        .eq("updated_at", ch.expectedUpdatedAt ?? existing.updated_at ?? "");

      if (error) return { ok: false, message: error.message };
      const { data: updatedMove } = await supabase
        .from("room_assignments")
        .select("room_assignment_id")
        .eq("room_assignment_id", ch.roomAssignmentId)
        .maybeSingle();
      if (!updatedMove) return { ok: false, message: CONFLICT_MESSAGE };
      affected.add(ch.reservationId);
      applied++;
    } else if (ch.type === "assign") {
      const p = ch.payload;
      const [{ data: reservation }, { data: room }] = await Promise.all([
        supabase
          .from("reservations")
          .select("reservation_id")
          .eq("reservation_id", p.reservationId)
          .maybeSingle(),
        supabase
          .from("rooms")
          .select("room_id, room_name")
          .eq("room_id", p.roomId)
          .maybeSingle(),
      ]);

      if (!reservation) return { ok: false, message: "予約が見つかりません。" };
      if (!room) return { ok: false, message: "部屋が見つかりません。" };

      const { data: duplicate } = await supabase
        .from("room_assignments")
        .select("room_assignment_id")
        .eq("reservation_id", p.reservationId)
        .eq("room_id", p.roomId)
        .eq("stay_start", p.startDate)
        .eq("stay_end", p.endDate)
        .eq("is_archived", false)
        .maybeSingle();

      if (duplicate) {
        affected.add(ch.reservationId);
        applied++;
        continue;
      }

      const conflict = await checkRoomConflict(supabase, {
        roomId: p.roomId,
        startDate: p.startDate,
        endDate: p.endDate,
        reservationId: p.reservationId,
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
        reservation_id: p.reservationId,
        room_id: p.roomId,
        room_name: room.room_name,
        stay_start: p.startDate,
        stay_end: p.endDate,
        assigned_guest_count: p.guestCount,
        male_count: p.maleCount,
        female_count: p.femaleCount,
        child_count: p.childCount,
        boy_student_count: p.boyStudent,
        girl_student_count: p.girlStudent,
        age_3plus_count: p.age3plus,
        under_3_count: p.under3,
        is_archived: false,
        sheet_created_at: nowIso,
        sheet_updated_at: nowIso,
        synced_at: nowIso,
        updated_at: nowIso,
      });

      if (error) return { ok: false, message: error.message };
      affected.add(ch.reservationId);
      applied++;
    } else if (ch.type === "unassign") {
      const { data: existing } = await supabase
        .from("room_assignments")
        .select("reservation_id, updated_at")
        .eq("room_assignment_id", ch.roomAssignmentId)
        .maybeSingle();

      if (!existing) return { ok: false, message: "部屋割りが見つかりません。" };

      const { error } = await supabase
        .from("room_assignments")
        .delete()
        .eq("room_assignment_id", ch.roomAssignmentId)
        .eq("updated_at", ch.expectedUpdatedAt ?? existing.updated_at ?? "");

      if (error) return { ok: false, message: error.message };
      affected.add(ch.reservationId);
      applied++;
    }
  }

  for (const rid of affected) {
    await syncAssignmentStatus(supabase, rid);
    revalidateReservationPaths(rid);
  }

  return {
    ok: true,
    applied,
    affectedReservationIds: [...affected],
  };
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

  const supabase = await createStaffClient();
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
