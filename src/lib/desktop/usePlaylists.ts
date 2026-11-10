"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPlaylists } from "@/lib/desktop/api";
import type { PlaylistRef } from "@/lib/propresenter/contracts";
import { errorMessage } from "@/lib/postJson";

interface Loaded {
  port: number;
  attempt: number;
  playlists: PlaylistRef[];
  error: string | null;
}

/**
 * ProPresenter's playlists, for a picker. Keeps "couldn't ask ProPresenter" apart from "it has no
 * playlists": the first shows its message, so a closed ProPresenter isn't mistaken for an empty
 * one. Results are tagged with the port and attempt they came from, so an answer from an earlier
 * port or retry never shows as the current one.
 */
export function usePlaylists(port: number) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlaylists(port).then(
      ({ playlists, error }) => {
        if (!cancelled) setLoaded({ port, attempt, playlists, error: error ?? null });
      },
      (err: unknown) => {
        if (!cancelled) setLoaded({ port, attempt, playlists: [], error: errorMessage(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [port, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const current = loaded?.port === port && loaded.attempt === attempt ? loaded : null;
  return {
    loading: current === null,
    playlists: current?.playlists ?? [],
    error: current?.error ?? null,
    reload,
  };
}
