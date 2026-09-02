"use client";

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { isDesktopApp } from "@/lib/tauri/env";
import { useLibraryStore } from "@/lib/store";
import { useGenerationStore } from "@/lib/generationStore";

/**
 * Bridges the quick-add popup window (global hotkey, see src-tauri/src/lib.rs
 * + src/app/quick-add/page.tsx) into the main window: that popup is a
 * separate webview with its own in-memory stores, so it can only hand things
 * over here via Tauri events, not direct state access.
 */
export function useQuickAddListener() {
  const selectSong = useLibraryStore((s) => s.selectSong);
  const startGeneration = useGenerationStore((s) => s.start);
  const failGeneration = useGenerationStore((s) => s.fail);
  const finishGeneration = useGenerationStore((s) => s.finish);

  useEffect(() => {
    if (!isDesktopApp()) return;

    const unlistenGenerating = listen<{ query: string }>("song-generating", (event) => {
      startGeneration(event.payload.query);
    });

    const unlistenCreated = listen<{ id: string }>("song-created", async (event) => {
      await useLibraryStore.persist.rehydrate();
      selectSong(event.payload.id);
      finishGeneration();
    });

    const unlistenFailed = listen<{ error: string }>("song-generation-failed", (event) => {
      failGeneration(event.payload.error);
    });

    return () => {
      void unlistenGenerating.then((f) => f());
      void unlistenCreated.then((f) => f());
      void unlistenFailed.then((f) => f());
    };
  }, [selectSong, startGeneration, failGeneration, finishGeneration]);
}
