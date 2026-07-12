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
  commitOccDraftAssign,
  commitOccDraftMove,
  commitOccDraftUnassign,
  computeOccEditChanges,
  type OccDragPayload,
} from "@/lib/services/occ-edit";
import {
  UNASSIGNED_ROOM_ID,
  type RoomOccupancyMonthView,
} from "@/lib/services/room-occupancy";
import {
  eventClassName,
  formatBbqBadgeLabel,
  formatOccGuestMeta,
  formatOccNightLabel,
} from "@/lib/utils/occ-display";
import { useOccBoardDrag } from "@/components/rooms/useOccBoardDrag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

function OccEventBlock({
  ev,
  isShared,
  editMode,
}: {
  ev: RoomOccupancyMonthView["days"][0]["cells"][0]["events"][0];
  isShared: boolean;
  editMode: boolean;
}) {
  const nightLbl = formatOccNightLabel(ev);
  const meta = formatOccGuestMeta(ev);
  const bbqLabel = formatBbqBadgeLabel(ev.bbq);

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
}: {
  cell: RoomOccupancyMonthView["days"][0]["cells"][0];
  editMode: boolean;
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

  const onMonthInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parts = (e.target.value || "").split("-");
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
    <>

      <div className="occ-nav">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => guardedNavigate(monthHref(prev.year, prev.month))}
        >
          ←
        </Button>
        <div className="nav-date-picker">
          <label htmlFor="occ-month-input" className="nav-date-label">
            {displayData.monthLabel}
          </label>
          <Input
            type="month"
            id="occ-month-input"
            className="nav-date-input"
            value={monthValue}
            onChange={onMonthInputChange}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => guardedNavigate(monthHref(next.year, next.month))}
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
                          <OccCellContent cell={cell} editMode={editMode} />
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
        {editMode ? (
          <span className="occ-legend-draft">変更予定</span>
        ) : null}
        {isCurrentMonth ? (
          <span className="occ-legend-today">今日の行</span>
        ) : null}
      </div>
    </>
  );
}
