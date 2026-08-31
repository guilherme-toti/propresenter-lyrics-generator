import { buildAlignmentFromAiSections } from "@/lib/alignment";
import { createEmptySong, type Song } from "@/lib/types";
import type { AiSongResponse } from "./schema";

function reconstructRaw(sections: AiSongResponse["sections"], side: "original" | "translation"): string {
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
    key: response.key ?? "",
    mode: "ai",
    isOfficialTranslation: response.isOfficialTranslation,
    languageA: { label: response.originalLanguage, raw: reconstructRaw(response.sections, "original") },
    languageB: { label: response.translationLanguage, raw: reconstructRaw(response.sections, "translation") },
    alignment,
  });
}
