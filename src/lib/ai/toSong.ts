import { buildAlignmentFromAiSections } from "@/lib/alignment";
import { createEmptySong, type Song } from "@/lib/types";
import type { AiSongResponse } from "./schema";
import type { GeneratedSong } from "./openrouter";

type SectionLines = { lines: { original: string; translation: string }[] };

export function reconstructRaw(sections: SectionLines[], side: "original" | "translation"): string {
  return sections.map((section) => section.lines.map((line) => line[side]).join("\n")).join("\n\n");
}

/**
 * Editor A is always Português (Brasil) for AI-generated songs, regardless of which language the
 * identified song was actually written in — so when the original is English, we swap "original"
 * and "translation" here to relabel the Portuguese side as "original" (→ Editor A).
 */
function portugueseFirst(response: AiSongResponse): AiSongResponse["sections"] {
  if (response.originalLanguage === "Português (Brasil)") {
    return response.sections;
  }
  return response.sections.map((section) => ({
    label: section.label,
    lines: section.lines.map((line) => ({ original: line.translation, translation: line.original })),
  }));
}

/** Converts a validated AI response into a ready-to-edit Song draft. */
export function aiResponseToSong(
  response: AiSongResponse,
  generated: Pick<GeneratedSong, "originalSource" | "translationAttribution">,
): Song {
  const sections = portugueseFirst(response);
  const alignment = buildAlignmentFromAiSections(sections);

  // The picked recording backs whichever side matches originalLanguage; the other side (if it has
  // content) is a literal Musixmatch translation with attribution but no recording of its own —
  // same swap portugueseFirst() applies to the lines themselves.
  const originalIsA = response.originalLanguage === "Português (Brasil)";

  return createEmptySong({
    title: response.title,
    artist: response.artist,
    mode: "ai",
    languageA: reconstructRaw(sections, "original"),
    languageB: reconstructRaw(sections, "translation"),
    alignment,
    sourceA: originalIsA ? generated.originalSource : undefined,
    sourceB: originalIsA ? undefined : generated.originalSource,
    attributionA: originalIsA ? generated.originalSource.attribution : (generated.translationAttribution ?? undefined),
    attributionB: originalIsA ? (generated.translationAttribution ?? undefined) : generated.originalSource.attribution,
  });
}
