import {
  joinMultiSelectValues,
  parseMultiSelectValues,
  PAYMENT_STATUS_OPTIONS,
  REQUEST_STATUS_EDIT_OPTIONS,
  RESERVATION_STATUS_OPTIONS,
} from "@/lib/config/field-options";
import type { RoomAssignmentBatchChange } from "@/lib/actions/room-assignments";

export type SetupAssignmentRef = {
  room_assignment_id: string;
  room_id: string;
  stay_start: string;
  stay_end: string;
  updated_at: string | null;
};

export type ReservationSetupEditable = {
  reservation_id: string;
  representative_name: string | null;
  check_in: string | null;
  check_out: string | null;
  updated_at: string | null;
  status: string;
  guest_total: string;
  adult_male: string;
  adult_female: string;
  boy_student: string;
  girl_student: string;
  age_3plus: string;
  under_3: string;
  referral: string;
  travel_purpose: string;
  payment_status: string;
  internal_memo: string;
  completion_email_sent: boolean;
  day11_email_sent: boolean;
  day3_email_sent: boolean;
  /** 選択中の部屋ID（チェックイン〜アウト期間の割当） */
  room_ids: string[];
  /** 保存時の解除用（元の割当） */
  base_assignments: SetupAssignmentRef[];
};

export type RequestSetupEditable = {
  request_id: string;
  representative_name: string | null;
  check_in: string | null;
  guest_total: string | null;
  updated_at: string;
  status: string;
  reply_email_sent: boolean;
  internal_memo: string;
};

export type ReservationSetupPatch = {
  status?: string;
  guest_total?: string;
  adult_male?: string;
  adult_female?: string;
  boy_student?: string;
  girl_student?: string;
  age_3plus?: string;
  under_3?: string;
  referral?: string;
  travel_purpose?: string;
  payment_status?: string;
  internal_memo?: string;
  completion_email_sent?: boolean;
  day11_email_sent?: boolean;
  day3_email_sent?: boolean;
};

export type RequestSetupPatch = {
  status?: string;
  reply_email_sent?: boolean;
  internal_memo?: string;
};

export type ReservationSetupChange = {
  reservationId: string;
  expectedUpdatedAt: string | null;
  patch: ReservationSetupPatch;
};

export type RequestSetupChange = {
  requestId: string;
  expectedUpdatedAt: string | null;
  patch: RequestSetupPatch;
};

function normText(v: string | null | undefined): string {
  return String(v ?? "").trim();
}

function strField(base: string, draft: string): string | undefined {
  const b = normText(base);
  const d = normText(draft);
  return b === d ? undefined : d;
}

function boolField(base: boolean, draft: boolean): boolean | undefined {
  return base === draft ? undefined : draft;
}

function sortedIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))].sort();
}

function sameIdList(a: string[], b: string[]): boolean {
  const aa = sortedIds(a);
  const bb = sortedIds(b);
  if (aa.length !== bb.length) return false;
  return aa.every((id, i) => id === bb[i]);
}

function parseCount(v: string): number {
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function toReservationSetupEditable(row: {
  reservation_id: string;
  representative_name: string | null;
  check_in: string | null;
  check_out: string | null;
  updated_at: string | null;
  status: string;
  guest_total: string | null;
  adult_male: string | null;
  adult_female: string | null;
  boy_student: string | null;
  girl_student: string | null;
  age_3plus: string | null;
  under_3: string | null;
  referral: string | null;
  travel_purpose: string | null;
  payment_status: string | null;
  internal_memo: string | null;
  completion_email_sent: boolean;
  day11_email_sent: boolean;
  day3_email_sent: boolean;
  assignments: {
    room_assignment_id: string;
    room_id: string | null;
    room_name: string | null;
    stay_start: string;
    stay_end: string;
    updated_at: string | null;
  }[];
}): ReservationSetupEditable {
  const base_assignments: SetupAssignmentRef[] = row.assignments
    .filter((a): a is typeof a & { room_id: string } => Boolean(a.room_id))
    .map((a) => ({
      room_assignment_id: a.room_assignment_id,
      room_id: a.room_id,
      stay_start: a.stay_start,
      stay_end: a.stay_end,
      updated_at: a.updated_at,
    }));

  return {
    reservation_id: row.reservation_id,
    representative_name: row.representative_name,
    check_in: row.check_in,
    check_out: row.check_out,
    updated_at: row.updated_at,
    status: row.status,
    guest_total: normText(row.guest_total),
    adult_male: normText(row.adult_male),
    adult_female: normText(row.adult_female),
    boy_student: normText(row.boy_student),
    girl_student: normText(row.girl_student),
    age_3plus: normText(row.age_3plus),
    under_3: normText(row.under_3),
    referral: normText(row.referral),
    travel_purpose: joinMultiSelectValues(
      parseMultiSelectValues(row.travel_purpose)
    ),
    payment_status: normText(row.payment_status),
    internal_memo: String(row.internal_memo ?? ""),
    completion_email_sent: Boolean(row.completion_email_sent),
    day11_email_sent: Boolean(row.day11_email_sent),
    day3_email_sent: Boolean(row.day3_email_sent),
    room_ids: sortedIds(base_assignments.map((a) => a.room_id)),
    base_assignments,
  };
}

export function toRequestSetupEditable(row: {
  request_id: string;
  representative_name: string | null;
  check_in: string | null;
  guest_total: string | null;
  updated_at: string;
  status: string;
  reply_email_sent: boolean;
  internal_memo: string | null;
}): RequestSetupEditable {
  return {
    request_id: row.request_id,
    representative_name: row.representative_name,
    check_in: row.check_in,
    guest_total: row.guest_total,
    updated_at: row.updated_at,
    status: row.status,
    reply_email_sent: Boolean(row.reply_email_sent),
    internal_memo: String(row.internal_memo ?? ""),
  };
}

export function diffReservationSetupRow(
  base: ReservationSetupEditable,
  draft: ReservationSetupEditable
): ReservationSetupChange | null {
  const patch: ReservationSetupPatch = {};

  if (base.status !== draft.status) patch.status = draft.status;

  const guest_total = strField(base.guest_total, draft.guest_total);
  if (guest_total !== undefined) patch.guest_total = guest_total;
  const adult_male = strField(base.adult_male, draft.adult_male);
  if (adult_male !== undefined) patch.adult_male = adult_male;
  const adult_female = strField(base.adult_female, draft.adult_female);
  if (adult_female !== undefined) patch.adult_female = adult_female;
  const boy_student = strField(base.boy_student, draft.boy_student);
  if (boy_student !== undefined) patch.boy_student = boy_student;
  const girl_student = strField(base.girl_student, draft.girl_student);
  if (girl_student !== undefined) patch.girl_student = girl_student;
  const age_3plus = strField(base.age_3plus, draft.age_3plus);
  if (age_3plus !== undefined) patch.age_3plus = age_3plus;
  const under_3 = strField(base.under_3, draft.under_3);
  if (under_3 !== undefined) patch.under_3 = under_3;

  const referral = strField(base.referral, draft.referral);
  if (referral !== undefined) patch.referral = referral;

  const basePurpose = joinMultiSelectValues(
    parseMultiSelectValues(base.travel_purpose)
  );
  const draftPurpose = joinMultiSelectValues(
    parseMultiSelectValues(draft.travel_purpose)
  );
  if (basePurpose !== draftPurpose) patch.travel_purpose = draftPurpose;

  const payment_status = strField(base.payment_status, draft.payment_status);
  if (payment_status !== undefined) patch.payment_status = payment_status;

  if (base.internal_memo !== draft.internal_memo) {
    patch.internal_memo = draft.internal_memo;
  }

  const completion = boolField(
    base.completion_email_sent,
    draft.completion_email_sent
  );
  if (completion !== undefined) patch.completion_email_sent = completion;
  const day11 = boolField(base.day11_email_sent, draft.day11_email_sent);
  if (day11 !== undefined) patch.day11_email_sent = day11;
  const day3 = boolField(base.day3_email_sent, draft.day3_email_sent);
  if (day3 !== undefined) patch.day3_email_sent = day3;

  if (Object.keys(patch).length === 0) return null;

  return {
    reservationId: draft.reservation_id,
    expectedUpdatedAt: base.updated_at,
    patch,
  };
}

export function hasReservationRoomChange(
  base: ReservationSetupEditable,
  draft: ReservationSetupEditable
): boolean {
  return !sameIdList(base.room_ids, draft.room_ids);
}

export function buildRoomAssignmentChangesForSetup(
  base: ReservationSetupEditable,
  draft: ReservationSetupEditable
): RoomAssignmentBatchChange[] {
  if (!hasReservationRoomChange(base, draft)) return [];

  const start = draft.check_in;
  const end = draft.check_out;
  if (!start || !end) return [];

  const desired = new Set(sortedIds(draft.room_ids));
  const changes: RoomAssignmentBatchChange[] = [];

  for (const a of draft.base_assignments) {
    if (!desired.has(a.room_id)) {
      changes.push({
        type: "unassign",
        roomAssignmentId: a.room_assignment_id,
        reservationId: draft.reservation_id,
        expectedUpdatedAt: a.updated_at,
      });
    }
  }

  const existingRooms = new Set(
    draft.base_assignments
      .filter((a) => desired.has(a.room_id))
      .map((a) => a.room_id)
  );

  // 部屋割ボードの＋追加と同じく、予約の人数を初期値として全入れする。
  // 3歳未満は内訳に残すが割当合計（guestCount）には含めない。
  const male = parseCount(draft.adult_male);
  const female = parseCount(draft.adult_female);
  const boy = parseCount(draft.boy_student);
  const girl = parseCount(draft.girl_student);
  const age3 = parseCount(draft.age_3plus);
  const under3 = parseCount(draft.under_3);
  const breakdownMain = male + female + boy + girl + age3;
  const guestCount = parseCount(draft.guest_total) || breakdownMain;

  for (const roomId of desired) {
    if (existingRooms.has(roomId)) continue;
    changes.push({
      type: "assign",
      reservationId: draft.reservation_id,
      payload: {
        reservationId: draft.reservation_id,
        roomId,
        startDate: start,
        endDate: end,
        guestCount,
        maleCount: male,
        femaleCount: female,
        boyStudent: boy,
        girlStudent: girl,
        age3plus: age3,
        under3,
        childCount: boy + girl + age3 + under3,
      },
    });
  }

  return changes;
}

export function diffRequestSetupRow(
  base: RequestSetupEditable,
  draft: RequestSetupEditable
): RequestSetupChange | null {
  const patch: RequestSetupPatch = {};
  if (base.status !== draft.status) patch.status = draft.status;
  const reply = boolField(base.reply_email_sent, draft.reply_email_sent);
  if (reply !== undefined) patch.reply_email_sent = reply;
  if (base.internal_memo !== draft.internal_memo) {
    patch.internal_memo = draft.internal_memo;
  }
  if (Object.keys(patch).length === 0) return null;
  return {
    requestId: draft.request_id,
    expectedUpdatedAt: base.updated_at,
    patch,
  };
}

export function computeReservationSetupChanges(
  baseRows: ReservationSetupEditable[],
  draftRows: ReservationSetupEditable[]
): ReservationSetupChange[] {
  const byId = new Map(baseRows.map((r) => [r.reservation_id, r]));
  const changes: ReservationSetupChange[] = [];
  for (const draft of draftRows) {
    const base = byId.get(draft.reservation_id);
    if (!base) continue;
    const change = diffReservationSetupRow(base, draft);
    if (change) changes.push(change);
  }
  return changes;
}

export function computeReservationRoomChanges(
  baseRows: ReservationSetupEditable[],
  draftRows: ReservationSetupEditable[]
): RoomAssignmentBatchChange[] {
  const byId = new Map(baseRows.map((r) => [r.reservation_id, r]));
  const changes: RoomAssignmentBatchChange[] = [];
  for (const draft of draftRows) {
    const base = byId.get(draft.reservation_id);
    if (!base) continue;
    changes.push(...buildRoomAssignmentChangesForSetup(base, draft));
  }
  return changes;
}

export function countReservationSetupDirties(
  baseRows: ReservationSetupEditable[],
  draftRows: ReservationSetupEditable[]
): Set<string> {
  const byId = new Map(baseRows.map((r) => [r.reservation_id, r]));
  const ids = new Set<string>();
  for (const draft of draftRows) {
    const base = byId.get(draft.reservation_id);
    if (!base) continue;
    if (
      diffReservationSetupRow(base, draft) ||
      hasReservationRoomChange(base, draft)
    ) {
      ids.add(draft.reservation_id);
    }
  }
  return ids;
}

export function computeRequestSetupChanges(
  baseRows: RequestSetupEditable[],
  draftRows: RequestSetupEditable[]
): RequestSetupChange[] {
  const byId = new Map(baseRows.map((r) => [r.request_id, r]));
  const changes: RequestSetupChange[] = [];
  for (const draft of draftRows) {
    const base = byId.get(draft.request_id);
    if (!base) continue;
    const change = diffRequestSetupRow(base, draft);
    if (change) changes.push(change);
  }
  return changes;
}

export function validateReservationSetupPatch(
  patch: ReservationSetupPatch
): string | null {
  if (
    patch.status !== undefined &&
    !RESERVATION_STATUS_OPTIONS.includes(
      patch.status as (typeof RESERVATION_STATUS_OPTIONS)[number]
    )
  ) {
    return "ステータスが不正です。";
  }
  if (
    patch.payment_status !== undefined &&
    patch.payment_status !== "" &&
    !PAYMENT_STATUS_OPTIONS.includes(
      patch.payment_status as (typeof PAYMENT_STATUS_OPTIONS)[number]
    )
  ) {
    return "支払状況が不正です。";
  }
  return null;
}

export function validateRequestSetupPatch(
  patch: RequestSetupPatch
): string | null {
  if (patch.status === undefined) return null;
  if (
    !REQUEST_STATUS_EDIT_OPTIONS.includes(
      patch.status as (typeof REQUEST_STATUS_EDIT_OPTIONS)[number]
    )
  ) {
    return "ステータスが不正です。";
  }
  return null;
}
