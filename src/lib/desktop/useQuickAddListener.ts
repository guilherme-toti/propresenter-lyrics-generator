"use client";

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { isDesktopApp } from "@/lib/tauri/env";
import { useLibraryStore } from "@/lib/store";

/**
 * Picks up songs created from the quick-add popup window (global hotkey,
 * see src-tauri/src/lib.rs + src/app/quick-add/page.tsx). That popup is a
 * separate webview with its own in-memory store, so the main window has to
 * explicitly rehydrate from localStorage before the new song shows up here.
 */
export function useQuickAddListener() {
  const selectSong = useLibraryStore((s) => s.selectSong);

  useEffect(() => {
    if (!isDesktopApp()) return;

    const unlisten = listen<{ id: string }>("song-created", async (event) => {
      await useLibraryStore.persist.rehydrate();
      selectSong(event.payload.id);
    });

    return () => {
      void unlisten.then((f) => f());
    };
  }, [selectSong]);
}
