"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isDesktopApp } from "@/lib/tauri/env";
import { slotIdAtPoint } from "./dropTargets";

export interface NativeDragState {
  /** The slot of the screen under the pointer, or null anywhere else on the page. */
  overSlotId: string | null;
}

/**
 * Files dragged in from Finder or Explorer. Tauri keeps native file drops for itself, so the
 * HTML5 drop event never carries them; its own event gives absolute paths and a position, which
 * is hit-tested against the screens. Returns null when nothing is being dragged.
 */
export function useNativeFileDrop(onDrop: (paths: string[], slotId: string | null) => void): NativeDragState | null {
  const [drag, setDrag] = useState<NativeDragState | null>(null);
  const handleDrop = useEffectEvent(onDrop);

  useEffect(() => {
    if (!isDesktopApp()) return;
    let unlisten: (() => void) | null = null;
    let disposed = false;

    void getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "leave") {
          setDrag(null);
          return;
        }
        const { x, y } = payload.position.toLogical(window.devicePixelRatio);
        const slotId = slotIdAtPoint(x, y);
        if (payload.type === "drop") {
          setDrag(null);
          if (payload.paths.length > 0) handleDrop(payload.paths, slotId);
          return;
        }
        // "over" fires on every mouse move; only a new screen under the pointer is news.
        setDrag((prev) => (prev?.overSlotId === slotId ? prev : { overSlotId: slotId }));
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return drag;
}
