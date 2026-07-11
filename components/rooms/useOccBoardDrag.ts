"use client";

import { useEffect, useRef } from "react";
import type { OccDragPayload } from "@/lib/services/occ-edit";
import { UNASSIGNED_ROOM_ID } from "@/lib/services/room-occupancy";

const OCC_DRAG_START_PX = 8;
const OCC_ARMED_DRAG_PX = 4;
const OCC_TAP_MOVE_PX = 14;
const OCC_TAP_MAX_MS = 480;
const OCC_LONG_PRESS_MS = 450;
const OCC_SCROLL_CANCEL_PX = 12;

type DragSession = OccDragPayload & {
  el: HTMLElement;
  px: number;
  py: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  dropRoomId: string | null;
  pointerId?: number;
  isTouch?: boolean;
  phase?: string;
  timer?: ReturnType<typeof setTimeout>;
  scrollTop?: number;
  scrollLeft?: number;
  t0?: number;
};

type UseOccBoardDragOptions = {
  editMode: boolean;
  boardRef: React.RefObject<HTMLDivElement | null>;
  onDrop: (payload: OccDragPayload, toRoomId: string) => void;
  onOpenDetail: (reservationId: string) => void;
  onPrefetchDetail?: (reservationId: string) => void;
};

function isCoarsePointer(): boolean {
  try {
    return (
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(hover: none)").matches
    );
  } catch {
    return "ontouchstart" in window;
  }
}

function payloadFromElement(el: HTMLElement): OccDragPayload | null {
  const reservationId = el.getAttribute("data-id") || "";
  if (!reservationId) return null;
  const assignmentId = el.getAttribute("data-assignment-id") || "";
  const isUnassigned = el.getAttribute("data-unassigned") === "1";
  if (!isUnassigned && !assignmentId) return null;

  return {
    reservationId,
    assignmentId,
    isUnassigned,
    fromRoomId: el.getAttribute("data-room-id") || "",
    startDateStr: el.getAttribute("data-start") || "",
    endDateStr: el.getAttribute("data-end") || "",
    guestCount: Number(el.getAttribute("data-guest-count")) || 0,
    adultMale: Number(el.getAttribute("data-male")) || 0,
    adultFemale: Number(el.getAttribute("data-female")) || 0,
    boyStudent: Number(el.getAttribute("data-boy")) || 0,
    girlStudent: Number(el.getAttribute("data-girl")) || 0,
    age3plus: Number(el.getAttribute("data-age3")) || 0,
    under3: Number(el.getAttribute("data-under3")) || 0,
  };
}

function scrubDragArtifacts(body: HTMLElement | null) {
  document.body.classList.remove(
    "occ-dragging-active",
    "occ-drag-from-unassigned"
  );
  if (!body) return;
  body.classList.remove("occ-board-drag-mode");
  body.querySelectorAll(".occ-event.occ-drag-block, .occ-event.occ-drag-armed").forEach((el) => {
    el.classList.remove("occ-drag-block", "occ-drag-armed");
  });
  body.querySelectorAll(".occ-cell.occ-drop-hover").forEach((c) => {
    c.classList.remove("occ-drop-hover");
  });
}

function cellFromPoint(
  body: HTMLElement,
  ghost: HTMLElement | null,
  x: number,
  y: number,
  allowUnassigned: boolean
): HTMLElement | null {
  if (ghost) ghost.style.visibility = "hidden";
  const list = document.elementsFromPoint(x, y);
  if (ghost) ghost.style.visibility = "";
  for (const node of list) {
    if (!(node instanceof Element)) continue;
    const cell = node.closest(".occ-cell[data-room-id]");
    if (!cell || !(cell instanceof HTMLElement)) continue;
    const roomId = cell.getAttribute("data-room-id");
    if (!roomId) continue;
    if (roomId === UNASSIGNED_ROOM_ID && !allowUnassigned) continue;
    return cell;
  }
  return null;
}

function autoScrollContainer(container: HTMLElement, clientX: number) {
  const rect = container.getBoundingClientRect();
  const edge = 48;
  const speed = 12;
  if (clientX < rect.left + edge) {
    container.scrollLeft -= speed;
  } else if (clientX > rect.right - edge) {
    container.scrollLeft += speed;
  }
}

export function useOccBoardDrag({
  editMode,
  boardRef,
  onDrop,
  onOpenDetail,
  onPrefetchDetail,
}: UseOccBoardDragOptions) {
  const suppressClickUntil = useRef(0);
  const dragRef = useRef<DragSession | null>(null);
  const ghostRef = useRef<HTMLElement | null>(null);
  const touchSessionRef = useRef<DragSession | null>(null);

  useEffect(() => {
    const body = boardRef.current;
    if (!body) return;

    function updateDropTarget(
      session: DragSession,
      x: number,
      y: number,
      ghost: HTMLElement | null
    ) {
      session.lastX = x;
      session.lastY = y;
      const allowUnassigned = !session.isUnassigned && !!session.assignmentId;
      const cell = cellFromPoint(body!, ghost, x, y, allowUnassigned);
      body!.querySelectorAll(".occ-cell.occ-drop-hover").forEach((c) => {
        c.classList.remove("occ-drop-hover");
      });
      session.dropRoomId = null;
      if (!cell) return;
      const targetRoom = cell.getAttribute("data-room-id");
      if (!targetRoom || targetRoom === session.fromRoomId) return;
      if (targetRoom === UNASSIGNED_ROOM_ID && session.isUnassigned) return;
      session.dropRoomId = targetRoom;
      cell.classList.add("occ-drop-hover");
    }

    function beginMove(
      session: DragSession,
      x: number,
      y: number
    ): HTMLElement | null {
      if (session.moved) return ghostRef.current;
      session.moved = true;
      document.body.classList.add("occ-dragging-active");
      body!.classList.add("occ-board-drag-mode");
      if (session.isUnassigned) {
        document.body.classList.add("occ-drag-from-unassigned");
        body!
          .querySelectorAll(
            `.occ-event[data-unassigned="1"][data-id="${session.reservationId}"]`
          )
          .forEach((node) => node.classList.add("occ-drag-block"));
      } else if (session.assignmentId) {
        body!
          .querySelectorAll(
            `.occ-event[data-assignment-id="${session.assignmentId}"][data-id="${session.reservationId}"]`
          )
          .forEach((node) => node.classList.add("occ-drag-block"));
      }
      const g = session.el.cloneNode(true) as HTMLElement;
      g.classList.add("occ-drag-ghost");
      g.style.left = `${x}px`;
      g.style.top = `${y}px`;
      document.body.appendChild(g);
      updateDropTarget(session, x, y, g);
      ghostRef.current = g;
      return g;
    }

    function cleanupDrag() {
      scrubDragArtifacts(body);
      if (ghostRef.current?.parentNode) {
        ghostRef.current.parentNode.removeChild(ghostRef.current);
      }
      ghostRef.current = null;
    }

    function finishDrag(
      session: DragSession,
      x: number,
      y: number,
      openDetailOnCancel: boolean
    ) {
      const shouldCommit =
        session.moved || (session.dropRoomId && session.dropRoomId !== session.fromRoomId);
      if (!shouldCommit) {
        cleanupDrag();
        if (openDetailOnCancel && session.reservationId) {
          onOpenDetail(session.reservationId);
        }
        return;
      }

      suppressClickUntil.current = Date.now() + 450;
      let toRoomId = session.dropRoomId;
      if (!toRoomId) {
        const allowUnassigned = !session.isUnassigned && !!session.assignmentId;
        const cell = cellFromPoint(
          body!,
          ghostRef.current,
          x || session.lastX,
          y || session.lastY,
          allowUnassigned
        );
        if (cell) toRoomId = cell.getAttribute("data-room-id");
      }
      cleanupDrag();

      if (!toRoomId || toRoomId === session.fromRoomId) return;
      if (!editMode) return;

      onDrop(session, toRoomId);
    }

    function onBoardClick(e: MouseEvent) {
      if (Date.now() < suppressClickUntil.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (editMode) return;
      const el = (e.target as Element).closest(".occ-event[data-id]");
      if (!el || !(el instanceof HTMLElement)) return;
      const rid = el.getAttribute("data-id");
      if (rid) onOpenDetail(rid);
    }

    function onBoardHover(e: MouseEvent) {
      if (editMode || !onPrefetchDetail) return;
      const el = (e.target as Element).closest(".occ-event[data-id]");
      if (!el || !(el instanceof HTMLElement)) return;
      const rid = el.getAttribute("data-id");
      if (rid) onPrefetchDetail(rid);
    }

    let docListening = false;

    function onDocMove(ev: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;
      const dx = ev.clientX - drag.px;
      const dy = ev.clientY - drag.py;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      updateDropTarget(drag, ev.clientX, ev.clientY, ghostRef.current);
      if (!drag.moved && dist > OCC_DRAG_START_PX) {
        beginMove(drag, ev.clientX, ev.clientY);
      }
      if (!drag.moved) return;
      if (ev.cancelable) ev.preventDefault();
      autoScrollContainer(body!, ev.clientX);
      if (ghostRef.current) {
        ghostRef.current.style.left = `${ev.clientX}px`;
        ghostRef.current.style.top = `${ev.clientY}px`;
      }
      updateDropTarget(drag, ev.clientX, ev.clientY, ghostRef.current);
    }

    function detachDocListeners() {
      if (!docListening) return;
      document.removeEventListener("pointermove", onDocMove);
      document.removeEventListener("pointerup", onDocEnd);
      document.removeEventListener("pointercancel", onDocEnd);
      docListening = false;
    }

    function onDocEnd(ev: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || ev.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      try {
        drag.el.releasePointerCapture?.(ev.pointerId);
      } catch {
        /* ignore */
      }
      detachDocListeners();
      finishDrag(drag, ev.clientX, ev.clientY, !drag.isTouch);
    }

    function onPointerDown(e: PointerEvent) {
      if (!editMode) return;
      if (e.pointerType === "touch") return;
      const el = (e.target as Element).closest(".occ-event[data-id]");
      if (!el || !(el instanceof HTMLElement)) return;
      const payload = payloadFromElement(el);
      if (!payload) return;
      if (e.button !== 0) return;

      detachDocListeners();
      dragRef.current = {
        ...payload,
        el,
        px: e.clientX,
        py: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
        dropRoomId: null,
        isTouch: false,
        pointerId: e.pointerId,
      };

      try {
        el.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }

      document.addEventListener("pointermove", onDocMove, { passive: false });
      document.addEventListener("pointerup", onDocEnd);
      document.addEventListener("pointercancel", onDocEnd);
      docListening = true;
    }

    function clearTouchSession() {
      const session = touchSessionRef.current;
      if (session?.timer) clearTimeout(session.timer);
      if (session?.el) session.el.classList.remove("occ-drag-armed");
      touchSessionRef.current = null;
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const el = (e.target as Element).closest(".occ-event[data-id]");
      if (!el || !(el instanceof HTMLElement)) return;

      if (!editMode) {
        clearTouchSession();
        const tapTouch = e.touches[0];
        touchSessionRef.current = {
          el,
          reservationId: el.getAttribute("data-id") || "",
          assignmentId: "",
          isUnassigned: false,
          fromRoomId: "",
          startDateStr: "",
          endDateStr: "",
          guestCount: 0,
          adultMale: 0,
          adultFemale: 0,
          boyStudent: 0,
          girlStudent: 0,
          age3plus: 0,
          under3: 0,
          px: tapTouch.clientX,
          py: tapTouch.clientY,
          lastX: tapTouch.clientX,
          lastY: tapTouch.clientY,
          moved: false,
          dropRoomId: null,
          phase: "tap-only",
          scrollTop: body!.scrollTop,
          scrollLeft: body!.scrollLeft,
          t0: Date.now(),
        };
        return;
      }

      const payload = payloadFromElement(el);
      if (!payload) return;
      clearTouchSession();
      const t = e.touches[0];
      touchSessionRef.current = {
        ...payload,
        el,
        px: t.clientX,
        py: t.clientY,
        lastX: t.clientX,
        lastY: t.clientY,
        moved: false,
        dropRoomId: null,
        phase: "hold-wait",
        scrollTop: body!.scrollTop,
        scrollLeft: body!.scrollLeft,
        t0: Date.now(),
        timer: setTimeout(() => {
          const session = touchSessionRef.current;
          if (!session || session.phase !== "hold-wait") return;
          session.phase = "drag-ready";
          session.el.classList.add("occ-drag-armed");
          body!.classList.add("occ-board-drag-mode");
          navigator.vibrate?.(12);
        }, OCC_LONG_PRESS_MS),
      };
    }

    function onTouchMove(e: TouchEvent) {
      const session = touchSessionRef.current;
      if (!session || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = Math.abs(t.clientX - session.px);
      const dy = Math.abs(t.clientY - session.py);
      const scrolled =
        Math.abs(body!.scrollTop - (session.scrollTop ?? 0)) > 3 ||
        Math.abs(body!.scrollLeft - (session.scrollLeft ?? 0)) > 3;

      if (session.phase === "hold-wait") {
        if (dx > OCC_SCROLL_CANCEL_PX || dy > OCC_SCROLL_CANCEL_PX || scrolled) {
          clearTouchSession();
        }
        return;
      }

      if (session.phase === "drag-ready" || session.phase === "dragging") {
        e.preventDefault();
        updateDropTarget(session, t.clientX, t.clientY, ghostRef.current);
        if (!session.moved && (dx > OCC_ARMED_DRAG_PX || dy > OCC_ARMED_DRAG_PX)) {
          session.phase = "dragging";
          beginMove(session, t.clientX, t.clientY);
        }
        if (session.moved) {
          autoScrollContainer(body!, t.clientX);
          if (ghostRef.current) {
            ghostRef.current.style.left = `${t.clientX}px`;
            ghostRef.current.style.top = `${t.clientY}px`;
          }
          updateDropTarget(session, t.clientX, t.clientY, ghostRef.current);
        }
      }
    }

    function onTouchEnd(e: TouchEvent) {
      const session = touchSessionRef.current;
      if (!session) return;
      touchSessionRef.current = null;
      if (session.timer) clearTimeout(session.timer);
      const t = e.changedTouches[0];

      if (session.phase === "tap-only") {
        if (!t) return;
        const tapDx = Math.abs(t.clientX - session.px);
        const tapDy = Math.abs(t.clientY - session.py);
        const tapDt = Date.now() - (session.t0 ?? 0);
        const tapScrolled =
          Math.abs(body!.scrollTop - (session.scrollTop ?? 0)) > 3 ||
          Math.abs(body!.scrollLeft - (session.scrollLeft ?? 0)) > 3;
        if (
          !tapScrolled &&
          tapDx <= OCC_TAP_MOVE_PX &&
          tapDy <= OCC_TAP_MOVE_PX &&
          tapDt <= OCC_TAP_MAX_MS &&
          session.reservationId
        ) {
          onOpenDetail(session.reservationId);
        }
        return;
      }

      if (session.phase === "hold-wait") {
        session.el.classList.remove("occ-drag-armed");
        if (!t) return;
        const dx = Math.abs(t.clientX - session.px);
        const dy = Math.abs(t.clientY - session.py);
        const dt = Date.now() - (session.t0 ?? 0);
        const scrolled =
          Math.abs(body!.scrollTop - (session.scrollTop ?? 0)) > 3 ||
          Math.abs(body!.scrollLeft - (session.scrollLeft ?? 0)) > 3;
        if (
          !scrolled &&
          dx <= OCC_TAP_MOVE_PX &&
          dy <= OCC_TAP_MOVE_PX &&
          dt <= OCC_TAP_MAX_MS
        ) {
          const hit = document.elementFromPoint(t.clientX, t.clientY);
          if (
            hit &&
            (session.el.contains(hit) || hit === session.el) &&
            session.reservationId
          ) {
            onOpenDetail(session.reservationId);
          }
        }
        return;
      }

      if (session.phase === "drag-ready" || session.phase === "dragging") {
        session.el.classList.remove("occ-drag-armed");
        finishDrag(session, t ? t.clientX : session.lastX, t ? t.clientY : session.lastY, false);
      }
    }

    function onTouchCancel() {
      cleanupDrag();
      clearTouchSession();
    }

    body.addEventListener("click", onBoardClick);
    body.addEventListener("mouseover", onBoardHover);
    body.addEventListener("pointerdown", onPointerDown);

    if (isCoarsePointer()) {
      body.addEventListener("touchstart", onTouchStart, { passive: true });
      body.addEventListener("touchmove", onTouchMove, { passive: false });
      body.addEventListener("touchend", onTouchEnd, { passive: true });
      body.addEventListener("touchcancel", onTouchCancel, { passive: true });
    }

    return () => {
      body.removeEventListener("click", onBoardClick);
      body.removeEventListener("mouseover", onBoardHover);
      body.removeEventListener("pointerdown", onPointerDown);
      body.removeEventListener("touchstart", onTouchStart);
      body.removeEventListener("touchmove", onTouchMove);
      body.removeEventListener("touchend", onTouchEnd);
      body.removeEventListener("touchcancel", onTouchCancel);
      detachDocListeners();
      cleanupDrag();
      clearTouchSession();
    };
  }, [editMode, boardRef, onDrop, onOpenDetail, onPrefetchDetail]);

  return { suppressClickUntil };
}
