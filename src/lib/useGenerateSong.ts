"use client";

import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";
import type { TrackCandidate } from "@/lib/lyrics/musixmatch";

const MIN_QUERY_LENGTH = 2;

/**
 * Shared "Generate with AI" flow: calls /api/generate-song and saves the
 * result as a new song. Hands the picked track off to the full-screen
 * loading/error overlay (useGenerationStore) rather than showing its own
 * inline loading state, so the result is returned directly instead of
 * exposed as hook state.
 */
export function useGenerateSong() {
  const startSong = useLibraryStore((s) => s.startSong);

  /**
   * Catalogue matches for the picker. An empty list means either nothing matched or no catalogue
   * is configured — either way, the dialog just shows the empty-results message, and "Criar
   * manualmente" is the only option left.
   */
  const search = async (
    query: string,
  ): Promise<{ results: TrackCandidate[] } | { error: string }> => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return { error: "Digite o título de uma música ou um trecho da letra." };
    }
    try {
      const res = await fetch("/api/songs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Algo deu errado.");
      return { results: data.results ?? [] };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Algo deu errado." };
    }
  };

  const generate = async (picked: TrackCandidate): Promise<{ ok: true } | { error: string }> => {
    try {
      const res = await fetch("/api/generate-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picked }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Algo deu errado.");
      }
      startSong(data.song as Song);
      return { ok: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Algo deu errado." };
    }
  };

  return { generate, search };
}
