"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { slotIdAtPoint } from "./dropTargets";

/** How far the pointer moves before a press becomes a drag, so a slightly shaky click still
 * selects the file. */
const DRAG_THRESHOLD_PX = 5;
/** Holding a dragged file this close to the top or bottom of the scrolling area scrolls it, so
 * macros below the fold can be reached without the wheel. */
const AUTO_SCROLL_EDGE_PX = 64;
/** Per frame, reached only at the very edge: speed grows with the square of how deep the pointer
 * is, so it creeps near the start of the zone and a screen can still be stopped on. */
const AUTO_SCROLL_MAX_STEP_PX = 12;

/** The nearest ancestor that scrolls vertically (in this app, the shell's <main>). */
function scrollParentOf(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement;
}

export interface TrayDragState {
  trayFileId: string;
  x: number;
  y: number;
  overSlotId: string | null;
}

interface Pressed {
  trayFileId: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** Where the pointer is now, for the auto-scroll, which runs between pointer events. */
  x: number;
  y: number;
  dragging: boolean;
  scroller: HTMLElement;
}

/**
 * Dragging a tray file onto a screen, built on pointer events rather than HTML5 drag and drop:
 * on Windows, Tauri's own file-drop handler turns HTML5 drag and drop inside the window off, and
 * that handler is what brings files in from Explorer.
 */
export function useTrayPointerDrag(onDrop: (trayFileId: string, slotId: string) => void) {
  const [drag, setDrag] = useState<TrayDragState | null>(null);
  const pressed = useRef<Pressed | null>(null);
  // The click that follows the pointerup of a drag must not also select the file.
  const suppressClick = useRef(false);

  const cancel = () => {
    pressed.current = null;
    setDrag(null);
  };

  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      suppressClick.current = true;
      pressed.current = null;
      setDrag(null);
    };
    window.addEventListener("keydown", onKeyDown);

    // A frame loop rather than pointermove, since a pointer held still at the edge sends none.
    let frame = requestAnimationFrame(function step() {
      const press = pressed.current;
      if (press?.dragging) {
        const area = press.scroller.getBoundingClientRect();
        const top = Math.max(area.top, 0);
        const bottom = Math.min(area.bottom, window.innerHeight);
        const depth =
          press.y < top + AUTO_SCROLL_EDGE_PX
            ? -(top + AUTO_SCROLL_EDGE_PX - press.y)
            : press.y > bottom - AUTO_SCROLL_EDGE_PX
              ? press.y - (bottom - AUTO_SCROLL_EDGE_PX)
              : 0;
        if (depth !== 0) {
          const before = press.scroller.scrollTop;
          const reach = Math.min(Math.abs(depth) / AUTO_SCROLL_EDGE_PX, 1);
          press.scroller.scrollTop += Math.sign(depth) * Math.max(1, AUTO_SCROLL_MAX_STEP_PX * reach * reach);
          // The page moved under a still pointer, so a different screen may be under it now.
          if (press.scroller.scrollTop !== before) {
            const overSlotId = slotIdAtPoint(press.x, press.y);
            setDrag((prev) => (prev && prev.overSlotId !== overSlotId ? { ...prev, overSlotId } : prev));
          }
        }
      }
      frame = requestAnimationFrame(step);
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(frame);
    };
  }, [dragging]);

  const handlersFor = (trayFileId: string) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      suppressClick.current = false;
      pressed.current = {
        trayFileId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        dragging: false,
        scroller: scrollParentOf(event.currentTarget),
      };
      // Keeps the moves coming while the pointer is over other elements, or outside the window.
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const press = pressed.current;
      if (!press || press.pointerId !== event.pointerId) return;
      press.x = event.clientX;
      press.y = event.clientY;
      if (!press.dragging) {
        if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) < DRAG_THRESHOLD_PX) return;
        press.dragging = true;
      }
      setDrag({ trayFileId, x: event.clientX, y: event.clientY, overSlotId: slotIdAtPoint(event.clientX, event.clientY) });
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const press = pressed.current;
      if (!press || press.pointerId !== event.pointerId) return;
      if (press.dragging) {
        suppressClick.current = true;
        const slotId = slotIdAtPoint(event.clientX, event.clientY);
        if (slotId) onDrop(trayFileId, slotId);
      }
      cancel();
    },
    onPointerCancel: cancel,
  });

  /** Wraps the tray file's click (which keyboards trigger too) so it's skipped right after a drag. */
  const clickGuard = (onClick: () => void) => () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onClick();
  };

  return { drag, handlersFor, clickGuard };
}
