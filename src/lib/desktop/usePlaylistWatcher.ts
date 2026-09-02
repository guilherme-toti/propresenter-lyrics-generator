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
 * Polls the configured Playlists folder for playlists this app hasn't seen
 * before (e.g. a new one created for this week's service) and surfaces one
 * at a time for the user to optionally adopt as the export destination.
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

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [playlistsFolder, rememberKnownPlaylists, markPlaylistsBaselined]);

  const confirm = (use: boolean) => {
    if (use && discovered) setActivePlaylist(discovered);
    setDiscovered(null);
  };

  return { discovered, confirm };
}
