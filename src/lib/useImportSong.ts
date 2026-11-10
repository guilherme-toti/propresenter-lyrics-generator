"use client";

import { useState } from "react";
import { errorMessage, postJsonAs } from "@/lib/postJson";
import {
  importableFilesReplySchema,
  importedSongReplySchema,
  type ImportableFile,
} from "@/lib/songSchema";
import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";

export type { ImportableFile };

/** Mirrors useGenerateSong.ts's shape — search()/importFile() instead of search()/generate(),
 * same {error} convention on failure. */
export function useImportSong() {
  const search = async (
    libraryFolder: string,
    query: string,
  ): Promise<{ files: ImportableFile[] } | { error: string }> => {
    try {
      return await postJsonAs("/api/songs/library-search", { libraryFolder, query }, importableFilesReplySchema);
    } catch (err) {
      return { error: errorMessage(err) };
    }
  };

  const importFile = async (path: string): Promise<{ ok: true; song: Song } | { error: string }> => {
    try {
      const { song } = await postJsonAs("/api/songs/import", { path }, importedSongReplySchema);
      return { ok: true, song };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  };

  return { search, importFile };
}

/**
 * Opens a file picked from the library half of "Procurar música"'s search as the active song,
 * locking the list and reporting failures while the file decodes. `onOpened` runs once the song is
 * in the studio (typically: close).
 */
export function useOpenLibraryFile(onOpened: () => void) {
  const startSong = useLibraryStore((s) => s.startSong);
  const { importFile } = useImportSong();
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (file: ImportableFile) => {
    setOpeningPath(file.path);
    setError(null);
    const result = await importFile(file.path);
    setOpeningPath(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    startSong(result.song);
    onOpened();
  };

  return { open, openingPath, error };
}
