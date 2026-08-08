"use server";

import { after } from "next/server";
import { revalidateReservationDetail, revalidateReservationDetailsBatch } from "@/lib/cache/revalidate";
import { nextRoomAssignmentId } from "@/lib/import/id-generation";
import { syncAssignmentStatus } from "@/lib/services/assignment-status";
import { syncReservationToGCal } from "@/lib/services/gcal-sync";
import {
  checkRoomConflict,
  hasOtherReservationConflictInFinalState,
  SHARED_ROOM_CONFIRM_MSG,
  type BatchSimAssignment,
} from "@/lib/services/room-conflicts";
import {
  clearRoomAssignmentsForReservation,
  isActiveReservationForRoomAssignment,
  shouldClearRoomAssignmentsOnStatus,
} from "@/lib/services/room-assignment-lifecycle";
import { createAdminClient, createStaffClient } from "@/lib/supabase/server";
import { CONFLICT_MESSAGE } from "@/lib/utils/optimistic-lock";

type ActionResult =
  | { ok: true; assignmentId?: string; needsConfirm?: false }
  | { ok: false; message: string; needsConfirm?: boolean };

function parseIntOrZero(value: FormDataEntryValue | null): number {
  const n = parseInt(String(value ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

/** 部屋割フォームの内訳から保存値を組み立て（合計人数欄は使わない） */
function guestCountsFromAssignmentForm(formData: FormData) {
  const male = parseIntOrZero(formData.get("male_count"));
  const female = parseIntOrZero(formData.get("female_count"));
  const boyStudent = parseIntOrZero(formData.get("boy_student_count"));
  const girlStudent = parseIntOrZero(formData.get("girl_student_count"));
  const age3plus = parseIntOrZero(formData.get("age_3plus_count"));
  const under3 = parseIntOrZero(formData.get("under_3_count"));
  const childCount = boyStudent + girlStudent + age3plus + under3;
  const fromFormTotal = parseIntOrZero(formData.get("assigned_guest_count"));
  // 3歳未満(+N)は表示用に残すが、割当合計には含めない
  const breakdownSum = male + female + boyStudent + girlStudent + age3plus;
  const assignedGuestCount =
    breakdownSum > 0 || under3 > 0 ? breakdownSum : fromFormTotal;
  return {
    male_count: male,
    female_count: female,
    boy_student_count: boyStudent,
    girl_student_count: girlStudent,
    age_3plus_count: age3plus,
    under_3_count: under3,
    child_count: childCount,
    assigned_guest_count: assignedGuestCount,
  };
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
    await syncAssignmentStatus(supabase, reservationId);
    revalidateReservationPaths(reservationId);
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
  const guestCounts = guestCountsFromAssignmentForm(formData);

  const { error } = await supabase.from("room_assignments").insert({
    room_assignment_id: roomAssignmentId,
    reservation_id: reservationId,
    room_id: roomId,
    room_name: room.room_name,
    stay_start: stayStart,
    stay_end: stayEnd,
    ...guestCounts,
    display_memo: null,
    assignment_memo: null,
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

  const guestCounts = guestCountsFromAssignmentForm(formData);
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("room_assignments")
    .update({
      room_id: roomId,
      room_name: roomName,
      stay_start: stayStart,
      stay_end: stayEnd,
      ...guestCounts,
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

export type RoomAssignmentGuestPayload = {
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
      payload: RoomAssignmentGuestPayload;
    }
  | {
      type: "update";
      roomAssignmentId: string;
      reservationId: string;
      expectedUpdatedAt?: string | null;
      payload: Omit<RoomAssignmentGuestPayload, "reservationId" | "roomId">;
    }
  | {
      type: "unassign";
      roomAssignmentId: string;
      reservationId: string;
      expectedUpdatedAt?: string | null;
    };

async function loadBaselineForBatchConflict(
  supabase: Awaited<ReturnType<typeof createStaffClient>>,
  changes: RoomAssignmentBatchChange[]
): Promise<BatchSimAssignment[]> {
  const touchedAssignmentIds = [
    ...new Set(
      changes
        .filter(
          (
            ch
          ): ch is Extract<
            RoomAssignmentBatchChange,
            { type: "move" | "unassign" | "update" }
          > =>
            ch.type === "move" || ch.type === "unassign" || ch.type === "update"
        )
        .map((ch) => ch.roomAssignmentId)
    ),
  ];

  const roomIds = new Set<string>();
  for (const ch of changes) {
    if (ch.type === "move") roomIds.add(ch.toRoomId);
    if (ch.type === "assign") roomIds.add(ch.payload.roomId);
  }

  const byId = new Map<string, BatchSimAssignment>();

  type DbRow = {
    room_assignment_id: string;
    reservation_id: string;
    room_id: string | null;
    stay_start: string;
    stay_end: string;
    reservations: { status: string; is_archived: boolean } | { status: string; is_archived: boolean }[];
  };

  const addRow = (row: DbRow) => {
    if (!row.room_id) return;
    const res = Array.isArray(row.reservations)
      ? row.reservations[0]
      : row.reservations;
    const sim: BatchSimAssignment = {
      room_assignment_id: row.room_assignment_id,
      reservation_id: row.reservation_id,
      room_id: row.room_id,
      stay_start: row.stay_start,
      stay_end: row.stay_end,
      reservation_status: res?.status ?? null,
      reservation_is_archived: res?.is_archived ?? null,
    };
    if (
      !isActiveReservationForRoomAssignment(
        sim.reservation_status,
        sim.reservation_is_archived
      )
    ) {
      return;
    }
    byId.set(sim.room_assignment_id, sim);
  };

  if (touchedAssignmentIds.length) {
    const { data: touched } = await supabase
      .from("room_assignments")
      .select(
        "room_assignment_id, reservation_id, room_id, stay_start, stay_end, reservations!inner(status, is_archived)"
      )
      .in("room_assignment_id", touchedAssignmentIds)
      .eq("is_archived", false);
    for (const row of (touched as DbRow[] | null) ?? []) {
      if (row.room_id) roomIds.add(row.room_id);
      addRow(row);
    }
  }

  if (roomIds.size) {
    const { data: inRooms } = await supabase
      .from("room_assignments")
      .select(
        "room_assignment_id, reservation_id, room_id, stay_start, stay_end, reservations!inner(status, is_archived)"
      )
      .in("room_id", [...roomIds])
      .eq("is_archived", false);
    for (const row of (inRooms as DbRow[] | null) ?? []) {
      addRow(row);
    }
  }

  return [...byId.values()];
}

export async function batchRoomAssignmentChangesAction(
  changes: RoomAssignmentBatchChange[],
  force = false
): Promise<BatchRoomAssignmentResult> {
  if (!changes.length) {
    return { ok: true, applied: 0, affectedReservationIds: [] };
  }

  const supabase = await createStaffClient();

  // 途中経過ではなく最終状態で別グループ重複を判定（A→B 後に C→A など）
  if (!force) {
    const baseline = await loadBaselineForBatchConflict(supabase, changes);
    if (hasOtherReservationConflictInFinalState(baseline, changes)) {
      return {
        ok: false,
        needsConfirm: true,
        message: SHARED_ROOM_CONFIRM_MSG,
      };
    }
  }

  const affected = new Set<string>();
  let applied = 0;

  for (const ch of changes) {
    if (ch.type === "move") {
      const { data: existing, error: existingError } = await supabase
        .from("room_assignments")
        .select(
          "room_assignment_id, reservation_id, room_id, room_name, stay_start, stay_end, updated_at"
        )
        .eq("room_assignment_id", ch.roomAssignmentId)
        .maybeSingle();

      if (existingError) return { ok: false, message: existingError.message };
      if (!existing) return { ok: false, message: "部屋割りが見つかりません。" };
      if (existing.room_id === ch.toRoomId) {
        applied++;
        affected.add(ch.reservationId);
        continue;
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
    } else if (ch.type === "update") {
      const p = ch.payload;
      const { data: existing, error: existingError } = await supabase
        .from("room_assignments")
        .select("room_assignment_id, reservation_id, updated_at")
        .eq("room_assignment_id", ch.roomAssignmentId)
        .maybeSingle();

      if (existingError) return { ok: false, message: existingError.message };
      if (!existing) return { ok: false, message: "部屋割りが見つかりません。" };

      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("room_assignments")
        .update({
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
          updated_at: nowIso,
          sheet_updated_at: nowIso,
        })
        .eq("room_assignment_id", ch.roomAssignmentId)
        .eq("updated_at", ch.expectedUpdatedAt ?? existing.updated_at ?? "");

      if (error) return { ok: false, message: error.message };
      const { data: updatedRow } = await supabase
        .from("room_assignments")
        .select("room_assignment_id")
        .eq("room_assignment_id", ch.roomAssignmentId)
        .maybeSingle();
      if (!updatedRow) return { ok: false, message: CONFLICT_MESSAGE };
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

  const affectedList = [...affected];
  await Promise.all(
    affectedList.map((rid) => syncAssignmentStatus(supabase, rid))
  );
  revalidateReservationDetailsBatch(affectedList);
  if (affectedList.length) {
    after(async () => {
      const admin = createAdminClient();
      for (const id of affectedList) {
        await syncReservationToGCal(admin, id);
      }
    });
  }

  return {
    ok: true,
    applied,
    affectedReservationIds: affectedList,
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
