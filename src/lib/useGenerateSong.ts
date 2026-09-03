"use client";

import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";
import type { TrackCandidate } from "@/lib/lyrics/musixmatch";

const MIN_QUERY_LENGTH = 2;

/**
 * Shared "Generate with AI" flow: calls /api/generate-song and saves the
 * result as a new song. Used by both the in-app "Nova música" dialog and the
 * standalone quick-add popup window (desktop app, global hotkey) — both hand
 * the query off to the full-screen loading/error overlay (useGenerationStore)
 * rather than showing their own inline loading state, so the result is
 * returned directly instead of exposed as hook state (which the quick-add
 * popup can't rely on anyway — it closes right after calling this).
 */
export function useGenerateSong() {
  const createSong = useLibraryStore((s) => s.createSong);

  /**
   * Catalogue matches for the picker. An empty list means either nothing matched or no catalogue
   * is configured — `configured` tells them apart, so the dialog can offer to generate anyway
   * instead of claiming the song doesn't exist.
   */
  const search = async (
    query: string,
  ): Promise<{ results: TrackCandidate[]; configured: boolean } | { error: string }> => {
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
      return { results: data.results ?? [], configured: Boolean(data.configured) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Algo deu errado." };
    }
  };

  const generate = async (query: string, picked?: TrackCandidate): Promise<{ id: string } | { error: string }> => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return { error: "Digite o título de uma música, um trecho da letra ou uma breve descrição." };
    }
    try {
      const res = await fetch("/api/generate-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, picked }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Algo deu errado.");
      }
      const id = createSong(data.song as Song);
      return { id };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Algo deu errado." };
    }
  };

  return { generate, search };
}
