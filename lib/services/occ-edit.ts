import {
  isSharedRoomEvents,
  sortOccCellEvents,
  UNASSIGNED_ROOM_ID,
  type OccEvent,
  type RoomOccupancyMonthView,
} from "@/lib/services/room-occupancy";

export type OccDragPayload = {
  reservationId: string;
  assignmentId: string;
  isUnassigned: boolean;
  fromRoomId: string;
  startDateStr: string;
  endDateStr: string;
  guestCount: number;
  adultMale: number;
  adultFemale: number;
  boyStudent: number;
  girlStudent: number;
  age3plus: number;
  under3: number;
};

export type OccAssignPayload = {
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

export type OccBoardChange =
  | {
      type: "move";
      roomAssignmentId: string;
      toRoomId: string;
      reservationId: string;
      expectedUpdatedAt?: string | null;
    }
  | { type: "assign"; reservationId: string; payload: OccAssignPayload }
  | {
      type: "unassign";
      roomAssignmentId: string;
      reservationId: string;
      expectedUpdatedAt?: string | null;
    };

type Placement = {
  assignmentId: string;
  roomId: string;
  reservationId: string;
  updatedAt?: string | null;
  ev: OccEvent;
};

export function cloneRoomMonthData(
  data: RoomOccupancyMonthView
): RoomOccupancyMonthView {
  return structuredClone(data);
}

function refreshOccCellShared(
  cell: RoomOccupancyMonthView["days"][0]["cells"][0]
) {
  cell.isShared = isSharedRoomEvents(cell.events);
}

function markDraftEvents(events: OccEvent[]) {
  for (const ev of events) {
    ev.isDraft = true;
  }
}

export function buildAssignmentPayloadFromDrag(
  d: OccDragPayload,
  toRoomId: string
): OccAssignPayload {
  const child =
    d.boyStudent + d.girlStudent + d.age3plus + d.under3;
  return {
    reservationId: d.reservationId,
    roomId: toRoomId || d.fromRoomId,
    startDate: d.startDateStr,
    endDate: d.endDateStr,
    guestCount: d.guestCount || 0,
    maleCount: d.adultMale || 0,
    femaleCount: d.adultFemale || 0,
    boyStudent: d.boyStudent || 0,
    girlStudent: d.girlStudent || 0,
    age3plus: d.age3plus || 0,
    under3: d.under3 || 0,
    childCount: child,
  };
}

function collectOccPlacementIndex(
  data: RoomOccupancyMonthView | null
): Record<string, Placement> {
  const byAssignment: Record<string, Placement> = {};
  if (!data?.days) return byAssignment;

  for (const day of data.days) {
    for (const cell of day.cells) {
      if (cell.roomId === UNASSIGNED_ROOM_ID) continue;
      for (const ev of cell.events || []) {
        const aid = String(ev.roomAssignmentId || "").trim();
        const rid = String(ev.reservationId || "").trim();
        if (!aid || !rid) continue;
        if (!byAssignment[aid]) {
          byAssignment[aid] = {
            assignmentId: aid,
            roomId: cell.roomId,
            reservationId: rid,
            updatedAt: ev.assignmentUpdatedAt,
            ev,
          };
        }
      }
    }
  }
  return byAssignment;
}

function collectOccBaseAssignmentsForReservation(
  base: RoomOccupancyMonthView | null,
  reservationId: string
): { assignmentId: string; roomId: string }[] {
  if (!base?.days || !reservationId) return [];
  const seen: Record<string, boolean> = {};
  const list: { assignmentId: string; roomId: string }[] = [];

  for (const day of base.days) {
    for (const cell of day.cells) {
      if (cell.roomId === UNASSIGNED_ROOM_ID) continue;
      for (const ev of cell.events || []) {
        const aid = String(ev.roomAssignmentId || "").trim();
        if (!aid || aid.startsWith("pending:")) continue;
        if (ev.reservationId !== reservationId || seen[aid]) continue;
        seen[aid] = true;
        list.push({ assignmentId: aid, roomId: cell.roomId });
      }
    }
  }
  return list;
}

export function computeOccEditChanges(
  base: RoomOccupancyMonthView | null,
  draft: RoomOccupancyMonthView | null
): OccBoardChange[] {
  if (!base || !draft) return [];
  const b = collectOccPlacementIndex(base);
  const d = collectOccPlacementIndex(draft);
  const changes: OccBoardChange[] = [];

  for (const aid of Object.keys(d)) {
    if (!aid.startsWith("pending:")) continue;
    const pl = d[aid];
    const rid = pl.reservationId;
    const baseForRid = Object.keys(b).filter((k) => b[k].reservationId === rid);
    if (
      baseForRid.length === 1 &&
      b[baseForRid[0]].roomId === pl.roomId
    ) {
      continue;
    }
    const ev = pl.ev;
    const child =
      (Number(ev.boyStudent) || 0) +
      (Number(ev.girlStudent) || 0) +
      (Number(ev.age3plus) || 0) +
      (Number(ev.under3) || 0);
    changes.push({
      type: "assign",
      reservationId: rid,
      payload: {
        reservationId: rid,
        roomId: pl.roomId,
        startDate: ev.startDateStr,
        endDate: ev.endDateStr,
        guestCount: Number(ev.guestCount) || Number(ev.guestTotal) || 0,
        maleCount: Number(ev.adultMale) || 0,
        femaleCount: Number(ev.adultFemale) || 0,
        boyStudent: Number(ev.boyStudent) || 0,
        girlStudent: Number(ev.girlStudent) || 0,
        age3plus: Number(ev.age3plus) || 0,
        under3: Number(ev.under3) || 0,
        childCount: child,
      },
    });
  }

  for (const aid of Object.keys(d)) {
    if (aid.startsWith("pending:")) continue;
    const cur = d[aid];
    const old = b[aid];
    if (!old || cur.roomId === old.roomId) continue;
    changes.push({
      type: "move",
      roomAssignmentId: aid,
      toRoomId: cur.roomId,
      reservationId: cur.reservationId,
      expectedUpdatedAt: old.updatedAt ?? null,
    });
  }

  for (const aid of Object.keys(b)) {
    if (aid.startsWith("pending:")) continue;
    if (d[aid]) continue;
    const rid = b[aid].reservationId;
    const pendingKey = `pending:${rid}`;
    if (d[pendingKey]) {
      if (d[pendingKey].roomId !== b[aid].roomId) {
        changes.push({
          type: "move",
          roomAssignmentId: aid,
          toRoomId: d[pendingKey].roomId,
          reservationId: rid,
          expectedUpdatedAt: b[aid].updatedAt ?? null,
        });
      }
      continue;
    }
    changes.push({
      type: "unassign",
      roomAssignmentId: aid,
      reservationId: rid,
      expectedUpdatedAt: b[aid].updatedAt ?? null,
    });
  }

  return changes;
}

function countOccRoomAssignmentsForReservation(
  data: RoomOccupancyMonthView,
  reservationId: string
): number {
  const ids: Record<string, boolean> = {};
  for (const day of data.days) {
    for (const cell of day.cells) {
      if (cell.roomId === UNASSIGNED_ROOM_ID) continue;
      for (const ev of cell.events || []) {
        if (ev.reservationId === reservationId && ev.roomAssignmentId) {
          ids[ev.roomAssignmentId] = true;
        }
      }
    }
  }
  return Object.keys(ids).length;
}

function findOccReservationIdForAssignment(
  data: RoomOccupancyMonthView,
  assignmentId: string
): string {
  for (const day of data.days) {
    for (const cell of day.cells) {
      for (const ev of cell.events || []) {
        if (ev.roomAssignmentId === assignmentId && ev.reservationId) {
          return ev.reservationId;
        }
      }
    }
  }
  return "";
}

function reservationAlreadyInRoom(
  data: RoomOccupancyMonthView,
  reservationId: string,
  roomId: string,
  excludeAssignmentId?: string
): boolean {
  for (const day of data.days) {
    const cell = day.cells.find((c) => c.roomId === roomId);
    if (!cell) continue;
    for (const ev of cell.events || []) {
      if (ev.reservationId !== reservationId) continue;
      if (excludeAssignmentId && ev.roomAssignmentId === excludeAssignmentId) {
        continue;
      }
      return true;
    }
  }
  return false;
}

export function applyOccAssignLocally(
  data: RoomOccupancyMonthView,
  d: OccDragPayload,
  toRoomId: string,
  assignmentId: string
): RoomOccupancyMonthView | null {
  if (
    !toRoomId ||
    toRoomId === UNASSIGNED_ROOM_ID ||
    !d.reservationId ||
    !d.isUnassigned
  ) {
    return null;
  }
  if (reservationAlreadyInRoom(data, d.reservationId, toRoomId)) {
    return null;
  }

  const next = cloneRoomMonthData(data);
  const rid = d.reservationId;

  for (const day of next.days) {
    const unassignedCell = day.cells.find(
      (c) => c.roomId === UNASSIGNED_ROOM_ID
    );
    const targetCell = day.cells.find((c) => c.roomId === toRoomId);
    if (!unassignedCell || !targetCell) continue;

    const moved: OccEvent[] = [];
    unassignedCell.events = (unassignedCell.events || []).filter((ev) => {
      if (ev.reservationId !== rid) return true;
      const copy = { ...ev };
      copy.roomAssignmentId = assignmentId;
      copy.roomId = toRoomId;
      copy.isUnassigned = false;
      moved.push(copy);
      return false;
    });

    if (moved.length) {
      targetCell.events = sortOccCellEvents([
        ...(targetCell.events || []),
        ...moved,
      ]);
      markDraftEvents(moved);
      refreshOccCellShared(targetCell);
      refreshOccCellShared(unassignedCell);
    }
  }

  return next;
}

export function resolveAssignAssignmentId(
  editBase: RoomOccupancyMonthView | null,
  reservationId: string
): string {
  const baseAssignments = collectOccBaseAssignmentsForReservation(
    editBase,
    reservationId
  );
  if (baseAssignments.length === 1) {
    return baseAssignments[0].assignmentId;
  }
  return `pending:${reservationId}`;
}

export function applyOccUnassignLocally(
  data: RoomOccupancyMonthView,
  assignmentId: string
): RoomOccupancyMonthView | null {
  const next = cloneRoomMonthData(data);
  const reservationId = findOccReservationIdForAssignment(next, assignmentId);
  const showInUnassignedColumn = reservationId
    ? countOccRoomAssignmentsForReservation(next, reservationId) <= 1
    : false;

  for (const day of next.days) {
    const moved: OccEvent[] = [];
    for (const cell of day.cells) {
      if (cell.roomId === UNASSIGNED_ROOM_ID) continue;
      const kept: OccEvent[] = [];
      for (const ev of cell.events || []) {
        if (ev.roomAssignmentId === assignmentId) {
          if (showInUnassignedColumn) {
            const copy = { ...ev };
            copy.roomAssignmentId = "";
            copy.roomId = UNASSIGNED_ROOM_ID;
            copy.isUnassigned = true;
            moved.push(copy);
          }
        } else {
          kept.push(ev);
        }
      }
      cell.events = kept;
      refreshOccCellShared(cell);
    }

    if (showInUnassignedColumn && moved.length) {
      const unassignedCell = day.cells.find(
        (c) => c.roomId === UNASSIGNED_ROOM_ID
      );
      if (unassignedCell) {
        const rid = moved[0]?.reservationId;
        if (rid) {
          unassignedCell.events = (unassignedCell.events || []).filter(
            (ev) => ev.reservationId !== rid
          );
        }
        unassignedCell.events = sortOccCellEvents([
          ...(unassignedCell.events || []),
          ...moved,
        ]);
        markDraftEvents(moved);
        refreshOccCellShared(unassignedCell);
      }
    }
  }

  return next;
}

export function applyOccMoveLocally(
  data: RoomOccupancyMonthView,
  assignmentId: string,
  toRoomId: string,
  reservationId: string
): RoomOccupancyMonthView | null {
  if (
    reservationAlreadyInRoom(data, reservationId, toRoomId, assignmentId)
  ) {
    return null;
  }

  const next = cloneRoomMonthData(data);
  for (const day of next.days) {
    const moved: OccEvent[] = [];
    for (const cell of day.cells) {
      const kept: OccEvent[] = [];
      for (const ev of cell.events || []) {
        if (ev.roomAssignmentId === assignmentId) {
          ev.roomId = toRoomId;
          moved.push(ev);
        } else {
          kept.push(ev);
        }
      }
      cell.events = kept;
      refreshOccCellShared(cell);
    }

    if (moved.length) {
      const target = day.cells.find((c) => c.roomId === toRoomId);
      if (target) {
        target.events = sortOccCellEvents([...(target.events || []), ...moved]);
        markDraftEvents(moved);
        refreshOccCellShared(target);
      }
    }
  }

  return next;
}

export function commitOccDraftAssign(
  data: RoomOccupancyMonthView,
  d: OccDragPayload,
  toRoomId: string,
  editBase: RoomOccupancyMonthView | null
): RoomOccupancyMonthView | null {
  const assignmentId = resolveAssignAssignmentId(editBase, d.reservationId);
  return applyOccAssignLocally(data, d, toRoomId, assignmentId);
}

export function commitOccDraftMove(
  data: RoomOccupancyMonthView,
  d: OccDragPayload,
  toRoomId: string
): RoomOccupancyMonthView | null {
  if (!toRoomId || toRoomId === d.fromRoomId || !d.assignmentId) return null;
  return applyOccMoveLocally(
    data,
    d.assignmentId,
    toRoomId,
    d.reservationId
  );
}

export function commitOccDraftUnassign(
  data: RoomOccupancyMonthView,
  d: OccDragPayload
): RoomOccupancyMonthView | null {
  if (!d.assignmentId || d.isUnassigned) return null;
  return applyOccUnassignLocally(data, d.assignmentId);
}
