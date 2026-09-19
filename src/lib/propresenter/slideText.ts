import type { AlignedLine } from "../types";

/**
 * The lines one language box renders for a slide. Lyrics are always projected in uppercase —
 * both languages — regardless of how they were typed or fetched, so the transform lives here
 * at the export boundary rather than in the editor, which keeps the user's text as written.
 *
 * Kept free of `@/` imports so `node --test` can load it (see build.ts, which cannot be).
 */
export function slideLines(rows: AlignedLine[], side: "a" | "b"): string[] {
  return rows.map((row) => row[side].toUpperCase());
}
