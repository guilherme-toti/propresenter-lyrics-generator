"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/postJson";
import type { BackgroundsOverview, MediaSlot } from "@/lib/propresenter/backgrounds/slots";
import { readBackgroundsOverview } from "./api";

interface Loaded {
  folder: string;
  version: number;
  overview: BackgroundsOverview | null;
  error: string | null;
}

/**
 * The workspace's macros and the files they show, read again whenever the window comes back into
 * focus. Results are tagged with the folder and reload they came from, so a list read from a
 * previous folder never shows under a new one, and a re-read keeps the current list on screen.
 */
export function useBackgroundsOverview(folder: string | null) {
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!folder) return;
    let cancelled = false;
    readBackgroundsOverview({ folder }).then(
      (overview) => {
        if (!cancelled) setLoaded({ folder, version, overview, error: null });
      },
      (err: unknown) => {
        if (!cancelled) setLoaded({ folder, version, overview: null, error: errorMessage(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [folder, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  // What changes the list happens in ProPresenter (pointing a macro at a new file, adding a video
  // again so it plays whole) or in Finder, so coming back to the app reads it again, as
  // "Atualizar" would. The same as the playlist watcher's check on focus.
  useEffect(() => {
    if (!folder) return;
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [folder, reload]);

  /** Swaps in the slot a replace answered with, so its screen shows the new file right away
   * instead of after the whole batch and the re-read. */
  const updateSlot = useCallback((slot: MediaSlot) => {
    setLoaded((prev) =>
      prev?.overview
        ? {
            ...prev,
            overview: {
              ...prev.overview,
              slots: prev.overview.slots.map((existing) => (existing.id === slot.id ? slot : existing)),
            },
          }
        : prev,
    );
  }, []);

  const current = folder !== null && loaded?.folder === folder ? loaded : null;
  return {
    overview: current?.overview ?? null,
    error: current?.error ?? null,
    loading: folder !== null && current?.version !== version,
    reload,
    updateSlot,
  };
}
