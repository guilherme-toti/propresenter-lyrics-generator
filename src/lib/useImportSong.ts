"use client";

import type { Song } from "@/lib/types";

export interface ImportableFile {
  library: string;
  filename: string;
  path: string;
}

/** Mirrors useGenerateSong.ts's shape — list()/importFile() instead of search()/generate(),
 * same {error} convention on failure. */
export function useImportSong() {
  const list = async (libraryFolder: string): Promise<{ files: ImportableFile[] } | { error: string }> => {
    try {
      const res = await fetch("/api/songs/import-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libraryFolder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Algo deu errado.");
      return { files: (data.files ?? []) as ImportableFile[] };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Algo deu errado." };
    }
  };

  const importFile = async (path: string): Promise<{ ok: true; song: Song } | { error: string }> => {
    try {
      const res = await fetch("/api/songs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Algo deu errado.");
      return { ok: true, song: data.song as Song };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Algo deu errado." };
    }
  };

  return { list, importFile };
}
