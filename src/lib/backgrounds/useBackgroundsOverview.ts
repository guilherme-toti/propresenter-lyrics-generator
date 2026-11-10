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
 * The workspace's macros and the files they show. Results are tagged with the folder and reload
 * they came from, so a list read from a previous folder never shows under a new one, and
 * "Atualizar" keeps the current list on screen while it re-reads.
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
