"use client";

import { useEffect, useState } from "react";
import { useDesktopStore } from "@/lib/desktopStore";
import { detectProPresenterFolder } from "./api";

/**
 * Fills "Pasta do ProPresenter" by itself while it's empty (or if the saved folder has no macros
 * and another workspace on the machine does), so most people never have to look for it. Returns
 * true while the initial lookup is running.
 */
export function useDetectProPresenterFolder(recheckWhenEmpty = false): boolean {
  const folder = useDesktopStore((s) => s.proPresenterFolder);
  const setFolder = useDesktopStore((s) => s.setProPresenterFolder);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (folder !== null && !recheckWhenEmpty) return;
    let cancelled = false;
    void detectProPresenterFolder().then((detected) => {
      if (cancelled) return;
      const current = useDesktopStore.getState().proPresenterFolder;
      // Only fill when unset, or switch away from an empty workspace if detection found a better one.
      if (detected && (current === null || (recheckWhenEmpty && current === folder && detected !== current))) {
        setFolder(detected);
      }
      setFinished(true);
    });
    return () => {
      cancelled = true;
    };
  }, [folder, recheckWhenEmpty, setFolder]);

  return folder === null && !finished;
}
