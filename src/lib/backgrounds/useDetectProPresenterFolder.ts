"use client";

import { useEffect, useState } from "react";
import { useDesktopStore } from "@/lib/desktopStore";
import { detectProPresenterFolder } from "./api";

export interface FolderDetection {
  /** True while the lookup that fills an empty setting is running. */
  detecting: boolean;
  /** Another workspace that has macros with media, when `lookForAnother` and the saved folder isn't it. */
  otherFolder: string | null;
}

/** Folder names ignore case on Windows and on macOS's default disks, so a picked folder spelled
 * differently from the detected one is still the same folder. */
function sameFolder(a: string, b: string): boolean {
  return a.normalize("NFC").toLowerCase() === b.normalize("NFC").toLowerCase();
}

/**
 * Fills "Pasta do ProPresenter" by itself while it's empty, so most people never have to look for
 * it. A saved folder is the user's call and is never replaced here: with `lookForAnother`, a better
 * folder found elsewhere comes back as `otherFolder` for the screen to offer.
 */
export function useDetectProPresenterFolder(lookForAnother = false): FolderDetection {
  const folder = useDesktopStore((s) => s.proPresenterFolder);
  const setFolder = useDesktopStore((s) => s.setProPresenterFolder);
  const [finished, setFinished] = useState(false);
  // Keyed by the folder it was found for, so a suggestion never outlives a folder change.
  const [suggestion, setSuggestion] = useState<{ for: string; folder: string } | null>(null);

  useEffect(() => {
    if (folder !== null && !lookForAnother) return;
    let cancelled = false;
    void detectProPresenterFolder().then((detected) => {
      if (cancelled) return;
      const current = useDesktopStore.getState().proPresenterFolder;
      if (current === null) {
        // The user may have picked a folder while the lookup ran.
        if (detected.folder) setFolder(detected.folder);
      } else if (detected.folder && detected.hasMacros && !sameFolder(detected.folder, current)) {
        setSuggestion({ for: current, folder: detected.folder });
      }
      setFinished(true);
    });
    return () => {
      cancelled = true;
    };
  }, [folder, lookForAnother, setFolder]);

  return {
    detecting: folder === null && !finished,
    otherFolder: lookForAnother && suggestion && suggestion.for === folder ? suggestion.folder : null,
  };
}
