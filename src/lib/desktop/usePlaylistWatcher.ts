"use client";

import { useEffect, useState } from "react";
import { isDesktopApp } from "@/lib/tauri/env";
import { useDesktopStore, type PlaylistRef } from "@/lib/desktopStore";

async function fetchPlaylists(port: number): Promise<PlaylistRef[]> {
  try {
    const res = await fetch("/api/playlists/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.error) return [];
    return Array.isArray(data.playlists) ? data.playlists : [];
  } catch {
    return [];
  }
}

/**
 * Asks ProPresenter for its playlists — but only while the app window is
 * focused — for playlists this app hasn't seen before (e.g. a new one
 * created for this week's service) and surfaces one at a time for the user
 * to optionally adopt as the export destination.
 *
 * Only fetching while focused isn't just about saving work: it avoids
 * catching a playlist mid-edit. If it fetched in the background, switching
 * back to the app right after renaming something in ProPresenter could
 * surface the *old* name (whatever ProPresenter reported during that last
 * background fetch) instead of the current one — confusing. Fetching on
 * focus-gain means the check always reflects what ProPresenter has *right
 * when you look at it*.
 */
export function usePlaylistWatcher() {
  const proApiPort = useDesktopStore((s) => s.proApiPort);
  const rememberKnownPlaylists = useDesktopStore((s) => s.rememberKnownPlaylists);
  const markPlaylistsBaselined = useDesktopStore((s) => s.markPlaylistsBaselined);
  const setActivePlaylist = useDesktopStore((s) => s.setActivePlaylist);

  const [discovered, setDiscovered] = useState<PlaylistRef | null>(null);

  useEffect(() => {
    if (!isDesktopApp() || !proApiPort) return;

    let cancelled = false;

    const check = async () => {
      const playlists = await fetchPlaylists(proApiPort);
      if (cancelled || playlists.length === 0) return;

      // Read fresh state directly from the store instead of React state, so
      // this callback never closes over a stale snapshot.
      const state = useDesktopStore.getState();

      if (!state.playlistsBaselined) {
        rememberKnownPlaylists(playlists.map((p) => p.id));
        markPlaylistsBaselined();
        return;
      }

      const unseen = playlists.filter((p) => !state.knownPlaylistIds.includes(p.id));
      if (unseen.length > 0) {
        rememberKnownPlaylists(playlists.map((p) => p.id));
        setDiscovered((current) => current ?? unseen[0]);
      }
    };

    if (document.hasFocus()) check();
    window.addEventListener("focus", check);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", check);
    };
  }, [proApiPort, rememberKnownPlaylists, markPlaylistsBaselined]);

  const confirm = (use: boolean) => {
    if (use && discovered) setActivePlaylist(discovered);
    setDiscovered(null);
  };

  return { discovered, confirm };
}
