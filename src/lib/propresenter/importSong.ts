import { alignmentToRaw, buildAlignmentFromManual, labelSections } from "@/lib/alignment";
import { exportOptionsSchema } from "@/lib/songSchema";
import { DEFAULT_EXPORT_OPTIONS, type AlignedLine, type ExportOptions } from "@/lib/types";
import { classifyLineLanguages } from "@/lib/ai/openrouter";
import { songFromAppLayout } from "./appLayout";
import { decodeProFile } from "./decode";
import { artistFromCredits } from "./importedArtist";
import { buildBilingualAlignment, buildRawTextFromTags, classifyCueLines } from "./languageDetect";

export interface ImportedSong {
  title: string;
  artist: string;
  languageA: string;
  languageB: string;
  alignment: AlignedLine[];
  exportOptions: ExportOptions;
}

/** A file edited in ProPresenter can hold more rows on a slide than a song may keep. */
const MAX_LINES_PER_SLIDE = exportOptionsSchema.shape.linesPerSlide.maxValue ?? Infinity;

/** Decodes a .pro file buffer and turns it into ready-to-edit song data, in the fields
 * createEmptySong() takes, so the caller (see /api/songs/import) can feed it straight in. */
export async function importSongFromProFile(buffer: Buffer): Promise<ImportedSong> {
  const { title, author, artistCredits, cueLines, cueBoxes, cueBoxGroups } = await decodeProFile(buffer);
  const artist = artistFromCredits({ author, artistCredits });

  const appSong = songFromAppLayout(cueBoxes, cueBoxGroups, labelSections);
  if (appSong) {
    const { alignment } = appSong;
    // A language the song isn't kept in stays "", so its editor shows the placeholder rather than blank lines.
    const raw = (side: "a" | "b") => (alignment.some((row) => row[side]) ? alignmentToRaw(alignment, side) : "");
    const exportOptions = { linesPerSlide: Math.min(appSong.linesPerSlide, MAX_LINES_PER_SLIDE) };
    return { title, artist, languageA: raw("a"), languageB: raw("b"), alignment, exportOptions };
  }

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

  return { title, artist, languageA, languageB, alignment, exportOptions: { ...DEFAULT_EXPORT_OPTIONS } };
}
