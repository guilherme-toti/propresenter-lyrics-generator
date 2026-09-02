"use client";

import { useEffect, useState } from "react";
import { isDesktopApp } from "@/lib/tauri/env";
import { useDesktopStore, type PlaylistRef } from "@/lib/desktopStore";

const POLL_INTERVAL_MS = 20_000;

async function scanFolder(folder: string): Promise<PlaylistRef[]> {
  try {
    const res = await fetch("/api/playlists/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.playlists) ? data.playlists : [];
  } catch {
    return [];
  }
}

/**
 * Polls the configured Playlists folder — but only while the app window is
 * focused — for playlists this app hasn't seen before (e.g. a new one
 * created for this week's service) and surfaces one at a time for the user
 * to optionally adopt as the export destination.
 *
 * Only polling while focused isn't just about saving work: it avoids
 * catching a playlist mid-edit. If it polled in the background, switching
 * back to the app right after renaming something in ProPresenter could
 * surface the *old* name (whatever was on disk during that last background
 * poll) instead of the current one — confusing. Polling on focus-gain means
 * the check always reflects what's on disk *right when you look at it*.
 */
export function usePlaylistWatcher() {
  const playlistsFolder = useDesktopStore((s) => s.playlistsFolder);
  const rememberKnownPlaylists = useDesktopStore((s) => s.rememberKnownPlaylists);
  const markPlaylistsBaselined = useDesktopStore((s) => s.markPlaylistsBaselined);
  const setActivePlaylist = useDesktopStore((s) => s.setActivePlaylist);

  const [discovered, setDiscovered] = useState<PlaylistRef | null>(null);

  useEffect(() => {
    if (!isDesktopApp() || !playlistsFolder) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      const playlists = await scanFolder(playlistsFolder);
      if (cancelled || playlists.length === 0) return;

      // Read fresh state directly from the store instead of React state, so
      // this interval callback never closes over a stale snapshot.
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

    const startPolling = () => {
      if (interval) return;
      poll();
      interval = setInterval(poll, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    if (document.hasFocus()) startPolling();
    window.addEventListener("focus", startPolling);
    window.addEventListener("blur", stopPolling);

    return () => {
      cancelled = true;
      stopPolling();
      window.removeEventListener("focus", startPolling);
      window.removeEventListener("blur", stopPolling);
    };
  }, [playlistsFolder, rememberKnownPlaylists, markPlaylistsBaselined]);

  const confirm = (use: boolean) => {
    if (use && discovered) setActivePlaylist(discovered);
    setDiscovered(null);
  };

  return { discovered, confirm };
}
