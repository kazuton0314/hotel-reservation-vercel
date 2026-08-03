"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { batchRoomAssignmentChangesAction } from "@/lib/actions/room-assignments";
import { showErrorToast, showSuccessToast } from "@/lib/utils/toast";
import {
  cloneRoomMonthData,
  commitOccDraftAddRoom,
  commitOccDraftAssign,
  commitOccDraftMove,
  commitOccDraftUnassign,
  computeOccEditChanges,
  countOccRoomAssignmentsForReservation,
  occAssignedRoomIdsForReservation,
  type OccDragPayload,
} from "@/lib/services/occ-edit";
import {
  UNASSIGNED_ROOM_ID,
  type OccEvent,
  type RoomOccupancyMonthView,
} from "@/lib/services/room-occupancy";
import {
  eventClassName,
  formatBbqBadgeLabel,
  formatOccGuestMeta,
  formatOccNightLabel,
} from "@/lib/utils/occ-display";
import { useOccBoardDrag } from "@/components/rooms/useOccBoardDrag";
import { NavDatePicker } from "@/components/calendar/NavDatePicker";
import { Button } from "@/components/ui/button";

type RoomOccupancyBoardProps = {
  data: RoomOccupancyMonthView;
  scrollToToday?: boolean;
};

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function monthHref(year: number, month: number, scrollToToday = false) {
  const m = `${year}-${String(month).padStart(2, "0")}`;
  return scrollToToday ? `/rooms?month=${m}&today=1` : `/rooms?month=${m}`;
}

function payloadFromOccEvent(
  ev: OccEvent,
  fromRoomId: string
): OccDragPayload | null {
  if (!ev.reservationId) return null;
  const isUnassigned = Boolean(ev.isUnassigned);
  if (!isUnassigned && !ev.roomAssignmentId) return null;
  return {
    reservationId: ev.reservationId,
    assignmentId: ev.roomAssignmentId || "",
    isUnassigned,
    fromRoomId,
    startDateStr: ev.startDateStr || "",
    endDateStr: ev.endDateStr || "",
    guestCount: Number(ev.guestCount) || Number(ev.guestTotal) || 0,
    adultMale: Number(ev.adultMale) || 0,
    adultFemale: Number(ev.adultFemale) || 0,
    boyStudent: Number(ev.boyStudent) || 0,
    girlStudent: Number(ev.girlStudent) || 0,
    age3plus: Number(ev.age3plus) || 0,
    under3: Number(ev.under3) || 0,
  };
}

function OccEventBlock({
  ev,
  isShared,
  editMode,
  assignmentCount,
  onAddRoom,
  onRemoveRoom,
}: {
  ev: RoomOccupancyMonthView["days"][0]["cells"][0]["events"][0];
  isShared: boolean;
  editMode: boolean;
  assignmentCount: number;
  onAddRoom?: () => void;
  onRemoveRoom?: () => void;
}) {
  const nightLbl = formatOccNightLabel(ev);
  const meta = formatOccGuestMeta(ev);
  const bbqLabel = formatBbqBadgeLabel(ev.bbq);
  const canRemoveRoom =
    editMode &&
    !ev.isUnassigned &&
    Boolean(ev.roomAssignmentId) &&
    assignmentCount >= 2;

  return (
    <div
      className={eventClassName(ev, isShared)}
      draggable={false}
      data-id={ev.reservationId}
      data-assignment-id={ev.roomAssignmentId || ""}
      data-room-id={ev.roomId || ""}
      data-start={ev.startDateStr || ""}
      data-end={ev.endDateStr || ""}
      data-guest-count={String(ev.guestCount || ev.guestTotal || 0)}
      data-male={String(ev.adultMale || 0)}
      data-female={String(ev.adultFemale || 0)}
      data-boy={String(ev.boyStudent || 0)}
      data-girl={String(ev.girlStudent || 0)}
      data-age3={String(ev.age3plus || 0)}
      data-under3={String(ev.under3 || 0)}
      {...(ev.isUnassigned ? { "data-unassigned": "1" } : {})}
      style={editMode ? undefined : { cursor: "pointer" }}
    >
      {editMode ? (
        <div className="occ-event-actions">
          <button
            type="button"
            className="occ-event-action"
            title="部屋を追加"
            aria-label="部屋を追加"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onAddRoom?.();
            }}
          >
            ＋
          </button>
          <button
            type="button"
            className="occ-event-action"
            title={
              canRemoveRoom
                ? "この部屋を削除"
                : "最後の1部屋は削除できません"
            }
            aria-label="部屋を削除"
            disabled={!canRemoveRoom}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!canRemoveRoom) return;
              onRemoveRoom?.();
            }}
          >
            −
          </button>
        </div>
      ) : null}
      <span className="occ-name">{ev.representativeName}</span>
      {nightLbl ? <span className="occ-nights">{nightLbl}</span> : null}
      <span className="occ-meta">
        {meta}
        {bbqLabel ? (
          <span className="meta-badge meta-bbq">{bbqLabel}</span>
        ) : null}
      </span>
    </div>
  );
}

function OccCellContent({
  cell,
  editMode,
  assignmentCountByReservation,
  onAddRoom,
  onRemoveRoom,
}: {
  cell: RoomOccupancyMonthView["days"][0]["cells"][0];
  editMode: boolean;
  assignmentCountByReservation: Map<string, number>;
  onAddRoom: (ev: RoomOccupancyMonthView["days"][0]["cells"][0]["events"][0]) => void;
  onRemoveRoom: (
    ev: RoomOccupancyMonthView["days"][0]["cells"][0]["events"][0]
  ) => void;
}) {
  if (!cell.events.length) {
    return <span className="occ-empty">—</span>;
  }

  return (
    <>
      {cell.events.map((ev) => (
        <OccEventBlock
          key={`${ev.reservationId}-${ev.roomAssignmentId}-${ev.isCheckin}-${ev.isCheckout}-${ev.isStay}`}
          ev={ev}
          isShared={cell.isShared}
          editMode={editMode}
          assignmentCount={
            assignmentCountByReservation.get(ev.reservationId) ?? 0
          }
          onAddRoom={() => onAddRoom(ev)}
          onRemoveRoom={() => onRemoveRoom(ev)}
        />
      ))}
    </>
  );
}

export function RoomOccupancyBoard({
  data,
  scrollToToday: scrollToTodayProp,
}: RoomOccupancyBoardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editBase, setEditBase] = useState<RoomOccupancyMonthView | null>(null);
  const [draftData, setDraftData] = useState<RoomOccupancyMonthView | null>(
    null
  );
  const [committing, setCommitting] = useState(false);

  const displayData = editMode && draftData ? draftData : data;
  const monthValue = `${displayData.year}-${String(displayData.month).padStart(2, "0")}`;
  const prev = shiftMonth(displayData.year, displayData.month, -1);
  const next = shiftMonth(displayData.year, displayData.month, 1);

  const changeCount = useMemo(() => {
    if (!editMode || !editBase || !draftData) return 0;
    return computeOccEditChanges(editBase, draftData).length;
  }, [editMode, editBase, draftData]);

  const isDirty = changeCount > 0;

  const assignmentCountByReservation = useMemo(() => {
    const map = new Map<string, number>();
    if (!editMode || !draftData) return map;
    const seen = new Set<string>();
    for (const day of draftData.days) {
      for (const cell of day.cells) {
        for (const ev of cell.events || []) {
          if (!ev.reservationId || seen.has(ev.reservationId)) continue;
          seen.add(ev.reservationId);
          map.set(
            ev.reservationId,
            countOccRoomAssignmentsForReservation(draftData, ev.reservationId)
          );
        }
      }
    }
    return map;
  }, [editMode, draftData]);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    if (type === "error") showErrorToast(message);
    else showSuccessToast(message);
  }, []);

  const exitEdit = useCallback((revert: boolean) => {
    if (revert && editBase) {
      setDraftData(cloneRoomMonthData(editBase));
    }
    setEditMode(false);
    setEditBase(null);
    setDraftData(null);
  }, [editBase]);

  const confirmDiscard = useCallback((): boolean => {
    if (!editMode) return true;
    if (!isDirty) {
      exitEdit(false);
      return true;
    }
    if (window.confirm("編集中の部屋割りを破棄しますか？")) {
      exitEdit(true);
      return true;
    }
    return false;
  }, [editMode, isDirty, exitEdit]);

  const guardedNavigate = useCallback(
    (href: string) => {
      if (!confirmDiscard()) return;
      router.push(href);
    },
    [confirmDiscard, router]
  );

  const handleOpenDetail = useCallback(
    (reservationId: string) => {
      if (editMode) return;
      router.push(`/reservations/${encodeURIComponent(reservationId)}`);
    },
    [editMode, router]
  );

  const handlePrefetchDetail = useCallback(
    (reservationId: string) => {
      if (editMode) return;
      router.prefetch(`/reservations/${encodeURIComponent(reservationId)}`);
    },
    [editMode, router]
  );

  const handleDrop = useCallback(
    (payload: OccDragPayload, toRoomId: string) => {
      if (!draftData) return;

      if (toRoomId === UNASSIGNED_ROOM_ID && !payload.isUnassigned) {
        const next = commitOccDraftUnassign(draftData, payload);
        if (!next) {
          showToast("表示の更新に失敗しました", "error");
          return;
        }
        setDraftData(next);
        return;
      }

      if (payload.isUnassigned) {
        const next = commitOccDraftAssign(
          draftData,
          payload,
          toRoomId,
          editBase
        );
        if (!next) {
          showToast("この部屋はすでにこの予約に割り当て済みです");
          return;
        }
        setDraftData(next);
        return;
      }

      const next = commitOccDraftMove(draftData, payload, toRoomId);
      if (!next) {
        showToast("この部屋はすでにこの予約に割り当て済みです");
        return;
      }
      setDraftData(next);
    },
    [draftData, editBase, showToast]
  );

  const handleAddRoomRequest = useCallback(
    (ev: OccEvent, fromRoomId: string) => {
      if (!editMode || !draftData) return;
      const payload = payloadFromOccEvent(ev, fromRoomId);
      if (!payload) return;
      const roomIds = displayData.rooms
        .filter((r) => !r.isUnassignedColumn)
        .map((r) => r.roomId);
      if (!roomIds.length) {
        showToast("追加先の部屋がありません", "error");
        return;
      }

      const assigned = occAssignedRoomIdsForReservation(
        draftData,
        payload.reservationId
      );

      const pickTarget = (): string | null => {
        if (payload.isUnassigned) {
          return roomIds.find((id) => !assigned.has(id)) ?? roomIds[0] ?? null;
        }
        const i = roomIds.indexOf(fromRoomId);
        const candidates =
          i >= 0
            ? [roomIds[i + 1], roomIds[i - 1], ...roomIds]
            : roomIds;
        for (const id of candidates) {
          if (!id) continue;
          if (assigned.has(id)) continue;
          return id;
        }
        return null;
      };

      const toRoomId = pickTarget();
      if (!toRoomId) {
        showToast("追加できる隣室がありません");
        return;
      }

      const next = payload.isUnassigned
        ? commitOccDraftAssign(draftData, payload, toRoomId, editBase)
        : commitOccDraftAddRoom(draftData, payload, toRoomId);
      if (!next) {
        showToast("この部屋はすでにこの予約に割り当て済みです");
        return;
      }
      setDraftData(next);
    },
    [editMode, draftData, displayData.rooms, editBase, showToast]
  );

  const handleRemoveRoom = useCallback(
    (ev: OccEvent, fromRoomId: string) => {
      if (!draftData) return;
      const payload = payloadFromOccEvent(ev, fromRoomId);
      if (!payload || payload.isUnassigned || !payload.assignmentId) return;
      const count = countOccRoomAssignmentsForReservation(
        draftData,
        payload.reservationId
      );
      if (count < 2) return;
      const next = commitOccDraftUnassign(draftData, payload);
      if (!next) {
        showToast("部屋の削除に失敗しました", "error");
        return;
      }
      setDraftData(next);
    },
    [draftData, showToast]
  );

  useOccBoardDrag({
    editMode,
    boardRef,
    onDrop: handleDrop,
    onOpenDetail: handleOpenDetail,
    onPrefetchDetail: handlePrefetchDetail,
  });

  useEffect(() => {
    router.prefetch(monthHref(prev.year, prev.month));
    router.prefetch(monthHref(next.year, next.month));
  }, [router, prev.year, prev.month, next.year, next.month]);

  const scrollToToday =
    scrollToTodayProp || searchParams.get("today") === "1";

  useEffect(() => {
    document.body.classList.add("rooms-active");
    return () => {
      document.body.classList.remove("rooms-active");
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("occ-fullscreen", fullscreen);
    return () => {
      document.body.classList.remove("occ-fullscreen");
    };
  }, [fullscreen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullscreen) setFullscreen(false);
        else if (editMode && !isDirty) exitEdit(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen, editMode, isDirty, exitEdit]);

  useEffect(() => {
    if (!scrollToToday) return;
    const row = document.getElementById("occ-row-today");
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    if (searchParams.get("today") === "1") {
      router.replace(monthHref(displayData.year, displayData.month, false), {
        scroll: false,
      });
    }
  }, [scrollToToday, displayData.year, displayData.month, router, searchParams]);

  const onMonthChange = useCallback(
    (nextValue: string) => {
      const parts = (nextValue || "").split("-");
      if (parts.length === 2 && parts[0] && parts[1]) {
        const y = Number(parts[0]);
        const m = Number(parts[1]);
        if (m >= 1 && m <= 12) {
          guardedNavigate(monthHref(y, m));
        }
      }
    },
    [guardedNavigate]
  );

  const enterEdit = () => {
    const clone = cloneRoomMonthData(data);
    setEditBase(clone);
    setDraftData(cloneRoomMonthData(data));
    setEditMode(true);
  };

  const handleCommit = async () => {
    if (!editBase || !draftData) return;
    const changes = computeOccEditChanges(editBase, draftData);
    if (!changes.length) {
      exitEdit(false);
      return;
    }
    if (
      !window.confirm(`${changes.length} 件の部屋割り変更を確定しますか？`)
    ) {
      return;
    }

    setCommitting(true);
    try {
      let result = await batchRoomAssignmentChangesAction(changes, false);
      if (!result.ok && result.needsConfirm) {
        if (!window.confirm(result.message)) return;
        result = await batchRoomAssignmentChangesAction(changes, true);
      }
      if (!result.ok) {
        showToast(result.message || "部屋割りの確定に失敗しました", "error");
        return;
      }
      showToast(`${result.applied} 件の部屋割りを確定しました`);
      setEditMode(false);
      setEditBase(null);
      setDraftData(null);
      router.refresh();
    } finally {
      setCommitting(false);
    }
  };

  const now = new Date();
  const isCurrentMonth =
    displayData.year === now.getFullYear() &&
    displayData.month === now.getMonth() + 1;

  return (
    <div className="occ-page">
      <div className="occ-nav">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => guardedNavigate(monthHref(prev.year, prev.month))}
          aria-label="前月"
        >
          ←
        </Button>
        <NavDatePicker
          id="occ-month-input"
          label={`${displayData.year}年${displayData.month}月`}
          type="month"
          value={monthValue}
          onChange={onMonthChange}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => guardedNavigate(monthHref(next.year, next.month))}
          aria-label="翌月"
        >
          →
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            guardedNavigate(
              monthHref(now.getFullYear(), now.getMonth() + 1, true)
            )
          }
        >
          今月
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setFullscreen((v) => !v)}
        >
          {fullscreen ? "全画面を終了" : "全画面"}
        </Button>
      </div>

      <div id="occ-edit-chrome">
        {!editMode ? (
          <div className="occ-edit-idle">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={enterEdit}
            >
              編集モード
            </Button>
          </div>
        ) : (
          <div className="occ-edit-bar">
            <p className="occ-edit-status">
              編集中 — <strong>{changeCount}</strong> 件の変更
            </p>
            <div className="occ-edit-actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={committing}
                onClick={() => {
                  if (!isDirty || window.confirm("編集中の部屋割りを破棄しますか？")) {
                    exitEdit(true);
                  }
                }}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!changeCount || committing}
                onClick={handleCommit}
              >
                {committing ? "反映中…" : "確定"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div
        ref={boardRef}
        id="rooms-body"
        className={`occ-board-wrap${editMode ? " occ-board-drag-mode" : ""}`}
      >
        <table className="occ-board">
          <thead>
            <tr>
              <th className="occ-date-col">日</th>
              {displayData.rooms.map((room) => {
                const thCls = room.isUnassignedColumn
                  ? "occ-room-col occ-unassigned-col"
                  : "occ-room-col";
                return (
                  <th key={room.roomId} className={thCls}>
                    <span className="occ-room-name">{room.roomName}</span>
                    {room.isUnassignedColumn ? (
                      <span className="occ-room-cap">—</span>
                    ) : room.capacity ? (
                      <span className="occ-room-cap">
                        定員：{room.capacity}名
                      </span>
                    ) : (
                      <span className="occ-room-cap">—</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayData.days.map((day) => {
              const rowCls = [
                "occ-day-row",
                day.isToday ? "occ-today-row" : "",
                day.isWeekend ? "occ-weekend-row" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <tr
                  key={day.date}
                  className={rowCls}
                  data-date={day.date}
                  id={day.isToday ? "occ-row-today" : undefined}
                >
                  <td className="occ-date-col">
                    <span className="occ-day-num">{day.dayNum}</span>
                    <span className="occ-wd">{day.weekday}</span>
                  </td>
                  {day.cells.map((cell) => {
                    const cellCls = [
                      "occ-cell",
                      cell.isShared ? "occ-shared-cell" : "",
                      cell.isUnassignedColumn ? "occ-unassigned-cell" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td
                        key={`${day.date}-${cell.roomId}`}
                        className={cellCls}
                        data-date={day.date}
                        data-room-id={cell.roomId}
                      >
                        <div className="occ-cell-inner">
                          <OccCellContent
                            cell={cell}
                            editMode={editMode}
                            assignmentCountByReservation={
                              assignmentCountByReservation
                            }
                            onAddRoom={(ev) =>
                              handleAddRoomRequest(ev, cell.roomId)
                            }
                            onRemoveRoom={(ev) =>
                              handleRemoveRoom(ev, cell.roomId)
                            }
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="occ-legend">
        <span className="occ-legend-stay">滞在</span>
        <span className="occ-legend-in">チェックイン</span>
        <span className="occ-legend-out">チェックアウト</span>
        <span className="occ-legend-shared">相部屋（同日宿泊が複数）</span>
        {editMode ? (
          <span className="occ-legend-draft">変更予定</span>
        ) : null}
        {isCurrentMonth ? (
          <span className="occ-legend-today">今日の行</span>
        ) : null}
      </div>

    </div>
  );
}
