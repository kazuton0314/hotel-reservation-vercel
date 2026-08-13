import assert from "node:assert/strict";
import { isoDateOnly } from "../lib/import/date-utils";
import {
  applyOccAddRoomLocally,
  applyOccMoveLocally,
  computeOccEditChanges,
  type OccDragPayload,
} from "../lib/services/occ-edit";
import {
  occupancyStayBounds,
  UNASSIGNED_ROOM_ID,
  buildRoomOccupancyMonthView,
  type OccEvent,
  type RoomOccupancyMonthView,
} from "../lib/services/room-occupancy";

const LOW = "room-low";
const OTHER = "room-other";
const RID = "STUDIO-MT1";
const AID = "RA-1";

function event(partial: Partial<OccEvent> & Pick<OccEvent, "roomId" | "roomAssignmentId">): OccEvent {
  return {
    reservationId: RID,
    representativeName: "テスト",
    isStay: true,
    isCheckin: false,
    isCheckout: false,
    startDateStr: "2026-08-10",
    endDateStr: "2026-08-12",
    guestCount: 4,
    adultMale: "2",
    adultFemale: "2",
    boyStudent: "0",
    girlStudent: "0",
    age3plus: "0",
    under3: "0",
    ...partial,
  };
}

function viewForRooms(
  placements: { roomId: string; assignmentId: string }[]
): RoomOccupancyMonthView {
  const rooms = [
    { roomId: UNASSIGNED_ROOM_ID, roomName: "未割当", isUnassignedColumn: true },
    { roomId: LOW, roomName: "低学年室" },
    { roomId: OTHER, roomName: "201" },
  ];
  const days = ["2026-08-10", "2026-08-11", "2026-08-12"].map((date, i) => ({
    date,
    dayNum: 10 + i,
    weekday: "月",
    isToday: false,
    isWeekend: false,
    cells: rooms.map((room) => ({
      roomId: room.roomId,
      roomName: room.roomName,
      isShared: false,
      isUnassignedColumn: room.roomId === UNASSIGNED_ROOM_ID,
      events:
        room.roomId === UNASSIGNED_ROOM_ID
          ? []
          : placements
              .filter((p) => p.roomId === room.roomId)
              .map((p) =>
                event({
                  roomId: p.roomId,
                  roomAssignmentId: p.assignmentId,
                  isCheckin: date === "2026-08-10",
                  isCheckout: date === "2026-08-12",
                  isStay: date !== "2026-08-12",
                })
              ),
    })),
  }));
  return {
    year: 2026,
    month: 8,
    monthLabel: "2026年8月",
    daysInMonth: 31,
    rooms,
    days,
  };
}

function payloadFromDraft(
  data: RoomOccupancyMonthView,
  assignmentId: string
): OccDragPayload {
  for (const day of data.days) {
    for (const cell of day.cells) {
      const ev = (cell.events || []).find(
        (e) => e.roomAssignmentId === assignmentId
      );
      if (!ev) continue;
      return {
        reservationId: RID,
        assignmentId,
        isUnassigned: false,
        fromRoomId: cell.roomId,
        startDateStr: ev.startDateStr,
        endDateStr: ev.endDateStr,
        guestCount: Number(ev.guestCount) || 0,
        adultMale: Number(ev.adultMale) || 0,
        adultFemale: Number(ev.adultFemale) || 0,
        boyStudent: Number(ev.boyStudent) || 0,
        girlStudent: Number(ev.girlStudent) || 0,
        age3plus: Number(ev.age3plus) || 0,
        under3: Number(ev.under3) || 0,
      };
    }
  }
  throw new Error(`assignment ${assignmentId} not found`);
}

function draftHasReservationInRoom(
  data: RoomOccupancyMonthView,
  roomId: string
): boolean {
  return data.days.some((day) =>
    day.cells.some(
      (cell) =>
        cell.roomId === roomId &&
        (cell.events || []).some((ev) => ev.reservationId === RID)
    )
  );
}

const base = viewForRooms([{ roomId: LOW, assignmentId: AID }]);
let draft = applyOccMoveLocally(base, AID, OTHER, RID);
assert.ok(draft, "move should succeed");
assert.equal(draftHasReservationInRoom(draft!, LOW), false);
assert.equal(draftHasReservationInRoom(draft!, OTHER), true);

const addPayload = payloadFromDraft(draft!, AID);
draft = applyOccAddRoomLocally(draft!, addPayload, LOW);
assert.ok(draft, "add room to 低学年室 should succeed");
assert.equal(draftHasReservationInRoom(draft!, LOW), true, "低学年室カードが残ること");
assert.equal(draftHasReservationInRoom(draft!, OTHER), true);

const changes = computeOccEditChanges(base, draft);
const assignToLow = changes.filter(
  (c) => c.type === "assign" && c.payload.roomId === LOW
);
const moveToOther = changes.filter(
  (c) => c.type === "move" && c.toRoomId === OTHER
);
assert.equal(
  assignToLow.length,
  1,
  `低学年室への新規割当が保存されること: ${JSON.stringify(changes)}`
);
assert.equal(
  moveToOther.length,
  1,
  `元の割当の移動が保存されること: ${JSON.stringify(changes)}`
);
assert.equal(
  changes[0]?.type,
  "move",
  "移動を先に確定してから追加割当すること"
);
assert.equal(changes[1]?.type, "assign");
assert.equal(
  changes.some((c) => c.type === "unassign"),
  false,
  "元の割当を解除しないこと"
);

assert.equal(isoDateOnly("2026-08-13T00:00:00.000Z"), "2026-08-13");
assert.equal(isoDateOnly("2026-08-13"), "2026-08-13");
assert.equal(
  occupancyStayBounds(
    { stay_start: "2026-08-01", stay_end: "2026-08-03" },
    { check_in: "2026-08-10", check_out: "2026-08-12" }
  ).start,
  "2026-08-10"
);
assert.equal(
  occupancyStayBounds(
    { stay_start: "2026-08-01", stay_end: "2026-08-03" },
    { check_in: "2026-08-10", check_out: "2026-08-12" }
  ).end,
  "2026-08-12"
);

const occupancy = buildRoomOccupancyMonthView(
  2026,
  8,
  [
    {
      room_id: LOW,
      room_name: "低学年室",
      room_type: "和",
      capacity: 10,
      sort_order: 1,
    },
  ],
  [
    {
      reservation_id: RID,
      representative_name: "テスト",
      status: "確定",
      check_in: "2026-08-20",
      check_out: "2026-08-22",
      nights: 2,
      guest_total: "4",
      adult_male: "2",
      adult_female: "2",
      boy_student: "0",
      girl_student: "0",
      age_3plus: "0",
      under_3: "0",
      bbq: "",
      somen: "",
      channel: "",
      assignment_status: "割当済",
    },
  ],
  [
    {
      room_assignment_id: AID,
      reservation_id: RID,
      room_id: LOW,
      stay_start: "2026-08-01",
      stay_end: "2026-08-03",
      assigned_guest_count: 4,
      male_count: 2,
      female_count: 2,
      boy_student_count: 0,
      girl_student_count: 0,
      age_3plus_count: 0,
      under_3_count: 0,
      updated_at: null,
    },
  ]
);
const datesWithCard = occupancy.days
  .filter((day) =>
    day.cells.some(
      (cell) =>
        cell.roomId === LOW &&
        cell.events.some((ev) => ev.reservationId === RID)
    )
  )
  .map((day) => day.date);
assert.deepEqual(
  datesWithCard,
  ["2026-08-20", "2026-08-21", "2026-08-22"],
  `部屋割カードは予約のCI/COに合わせる: ${datesWithCard.join(",")}`
);

console.log("verify-occ-edit-and-stay-bounds: ok");
