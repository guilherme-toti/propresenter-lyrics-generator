"use client";

import { useEffect, useState } from "react";
import { useDesktopStore } from "@/lib/desktopStore";
import { detectProPresenterFolder } from "./api";

/**
 * Fills "Pasta do ProPresenter" by itself while it's empty, so most people never have to look for
 * it. A folder the user chose is never replaced. Returns true while the lookup is running.
 */
export function useDetectProPresenterFolder(): boolean {
  const folder = useDesktopStore((s) => s.proPresenterFolder);
  const setFolder = useDesktopStore((s) => s.setProPresenterFolder);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (folder !== null) return;
    let cancelled = false;
    void detectProPresenterFolder().then((detected) => {
      if (cancelled) return;
      // The user may have picked a folder while the lookup ran.
      if (detected && useDesktopStore.getState().proPresenterFolder === null) setFolder(detected);
      setFinished(true);
    });
    return () => {
      cancelled = true;
    };
  }, [folder, setFolder]);

  return folder === null && !finished;
}
