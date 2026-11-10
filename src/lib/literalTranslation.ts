import type { RealignedLyrics } from "./songSchema";
import type { Song } from "./types";

/**
 * The song once a "Traduzir com IA" translation has landed on `side`. Nothing changes before
 * that, so a request that fails or is cancelled leaves the side exactly as it was. The side's own
 * recording and attribution go with the text they described: the AI text is neither that
 * recording nor Musixmatch's, so its copyright notice no longer applies. Only types are imported,
 * so `node --test` can load it.
 */
export function withLiteralTranslation(song: Song, side: "languageA" | "languageB", result: RealignedLyrics): Song {
  const sourceKey = side === "languageA" ? "sourceA" : "sourceB";
  const attributionKey = side === "languageA" ? "attributionA" : "attributionB";
  const statusKey = side === "languageA" ? "literalTranslationA" : "literalTranslationB";
  const next: Song = {
    ...song,
    languageA: result.languageARaw,
    languageB: result.languageBRaw,
    alignment: result.alignment,
    [statusKey]: "done",
  };
  delete next[sourceKey];
  delete next[attributionKey];
  return next;
}
