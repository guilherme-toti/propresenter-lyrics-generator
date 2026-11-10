"use client";

import { useLibraryStore } from "@/lib/store";
import { errorMessage, postJsonAs } from "@/lib/postJson";
import { generatedSongReplySchema, trackSearchReplySchema } from "@/lib/songSchema";
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
   * Catalogue matches for the picker. An empty list means the catalogue really found nothing; a
   * search that couldn't run (no key, a refused key, no connection) comes back as the route's
   * `error`, which says why.
   */
  const search = async (
    query: string,
  ): Promise<{ results: TrackCandidate[] } | { error: string }> => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return { error: "Digite o título de uma música ou um trecho da letra." };
    }
    try {
      return await postJsonAs("/api/songs/search", { query: trimmed }, trackSearchReplySchema);
    } catch (err) {
      return { error: errorMessage(err) };
    }
  };

  const generate = async (picked: TrackCandidate): Promise<{ ok: true } | { error: string }> => {
    try {
      const { song } = await postJsonAs("/api/generate-song", { picked }, generatedSongReplySchema);
      startSong(song);
      return { ok: true };
    } catch (err) {
      return { error: errorMessage(err) };
    }
  };

  return { generate, search };
}
