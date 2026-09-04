import { alignmentToRaw, buildAlignmentFromManual } from "@/lib/alignment";
import type { AlignedLine } from "@/lib/types";
import { classifyLineLanguages } from "@/lib/ai/openrouter";
import { decodeProFile } from "./decode";
import { buildBilingualAlignment, buildRawTextFromTags, classifyCueLines } from "./languageDetect";

export interface ImportedSong {
  title: string;
  languageA: string;
  languageB: string;
  alignment: AlignedLine[];
}

/** Decodes a .pro file buffer and turns it into ready-to-edit song data —
 * same shape generateSongWithAi() produces, so the caller (see
 * /api/songs/import) can feed it straight into createEmptySong(). */
export async function importSongFromProFile(buffer: Buffer): Promise<ImportedSong> {
  const { title, cueLines } = await decodeProFile(buffer);
  const { isBilingual, dominantLanguage, lineTags } = classifyCueLines(cueLines);

  const resolvedTags: ("pt" | "en")[][] = lineTags.map((tags) =>
    tags.map((tag) => (tag === "ambiguous" ? dominantLanguage : tag)),
  );

  if (isBilingual) {
    const ambiguous: { cueIndex: number; lineIndex: number; text: string }[] = [];
    lineTags.forEach((tags, cueIndex) => {
      tags.forEach((tag, lineIndex) => {
        if (tag === "ambiguous") ambiguous.push({ cueIndex, lineIndex, text: cueLines[cueIndex][lineIndex] });
      });
    });

    if (ambiguous.length > 0) {
      try {
        const resolved = await classifyLineLanguages(ambiguous.map((a) => a.text));
        ambiguous.forEach((a, i) => {
          resolvedTags[a.cueIndex][a.lineIndex] = resolved[i];
        });
      } catch (err) {
        // Already defaulted to dominantLanguage above — degrade gracefully,
        // never block the whole import over this.
        console.error("import: ambiguous line classification failed, using dominant language", err);
      }
    }
  }

  let alignment: AlignedLine[];
  let languageA: string;
  let languageB: string;

  if (isBilingual) {
    alignment = buildBilingualAlignment(cueLines, resolvedTags);
    languageA = alignmentToRaw(alignment, "a");
    languageB = alignmentToRaw(alignment, "b");
  } else {
    ({ languageA, languageB } = buildRawTextFromTags(cueLines, dominantLanguage));
    alignment = buildAlignmentFromManual(languageA, languageB);
  }

  return { title, languageA, languageB, alignment };
}
