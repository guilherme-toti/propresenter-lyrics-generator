import { buildAlignmentFromAiSections } from "@/lib/alignment";
import { createEmptySong, type Song } from "@/lib/types";
import type { AiSongResponse } from "./schema";

export function reconstructRaw(sections: { lines: { original: string; translation: string }[] }[], side: "original" | "translation"): string {
  return sections.map((section) => section.lines.map((line) => line[side]).join("\n")).join("\n\n");
}

/** Converts a validated AI response into a ready-to-edit Song draft. */
export function aiResponseToSong(response: AiSongResponse): Song {
  const alignment = buildAlignmentFromAiSections(
    response.sections.map((section) => ({ label: section.label, lines: section.lines })),
  );

  return createEmptySong({
    title: response.title,
    artist: response.artist,
    mode: "ai",
    isOfficialTranslation: response.isOfficialTranslation,
    languageA: reconstructRaw(response.sections, "original"),
    languageB: reconstructRaw(response.sections, "translation"),
    alignment,
  });
}
