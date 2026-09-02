"use client";

import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";

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

  const generate = async (query: string): Promise<{ id: string } | { error: string }> => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return { error: "Digite o título de uma música, um trecho da letra ou uma breve descrição." };
    }
    try {
      const res = await fetch("/api/generate-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
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

  return { generate };
}
