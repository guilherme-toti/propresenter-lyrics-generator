"use client";

import { useState } from "react";
import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";

/**
 * Shared "Generate with AI" flow: calls /api/generate-song and saves the
 * result as a new song. Used by both the in-app "Nova música" dialog and the
 * standalone quick-add popup window (desktop app, global hotkey).
 */
export function useGenerateSong() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createSong = useLibraryStore((s) => s.createSong);

  /** Returns the new song's id on success, or null (with `error` set) on failure. */
  const generate = async (query: string): Promise<string | null> => {
    if (query.trim().length < 2) {
      setError("Digite o título de uma música, um trecho da letra ou uma breve descrição.");
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Algo deu errado.");
      }
      return createSong(data.song as Song);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo deu errado.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { generate, loading, error, setError };
}
