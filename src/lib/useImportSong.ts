"use client";

import { useState } from "react";
import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";
import type { ImportableFile } from "@/lib/propresenter/libraries";

export type { ImportableFile };

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: Record<string, unknown> = await res.json();
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Algo deu errado.");
  return data;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Algo deu errado.";
}

/** Mirrors useGenerateSong.ts's shape — list()/search()/importFile() instead of search()/generate(),
 * same {error} convention on failure. */
export function useImportSong() {
  const list = async (libraryFolder: string): Promise<{ files: ImportableFile[] } | { error: string }> => {
    try {
      const data = await postJson("/api/songs/import-list", { libraryFolder });
      return { files: (data.files ?? []) as ImportableFile[] };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  };

  const search = async (
    libraryFolder: string,
    query: string,
  ): Promise<{ files: ImportableFile[] } | { error: string }> => {
    try {
      const data = await postJson("/api/songs/library-search", { libraryFolder, query });
      return { files: (data.files ?? []) as ImportableFile[] };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  };

  const importFile = async (path: string): Promise<{ ok: true; song: Song } | { error: string }> => {
    try {
      const data = await postJson("/api/songs/import", { path });
      return { ok: true, song: data.song as Song };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  };

  return { list, search, importFile };
}

/**
 * Opens a picked library file as the active song — shared by "Importar do ProPresenter" and the
 * library half of "Nova música"'s search, so both lock the list and report failures the same way
 * while the file decodes. `onOpened` runs once the song is in the studio (typically: close).
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
