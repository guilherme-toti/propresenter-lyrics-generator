"use client";

import { useEffect, useState } from "react";
import { isDesktopApp } from "@/lib/tauri/env";
import { useDesktopStore } from "@/lib/desktopStore";
import { playlistStillExists } from "@/lib/desktop/playlistStillExists";

/**
 * Once, right when the app starts, checks that the playlist selected in a
 * previous session still exists — it may have been deleted or renamed in
 * ProPresenter meanwhile — and surfaces a picker if not. Export time has its
 * own, separate check (see ExportFab); this just catches it earlier.
 */
export function useValidateActivePlaylist() {
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!isDesktopApp()) return;
    const { activePlaylist, playlistsFolder, setActivePlaylist } = useDesktopStore.getState();
    if (!activePlaylist || !playlistsFolder) return;

    let cancelled = false;
    playlistStillExists(playlistsFolder, activePlaylist.id).then((exists) => {
      if (cancelled || exists) return;
      setActivePlaylist(null);
      setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { missing, dismiss: () => setMissing(false) };
}
