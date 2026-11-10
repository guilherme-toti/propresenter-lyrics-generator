/** Reading back a song this app exported. Only type imports, so `node --test` can load it. */
import type { AlignedLine } from "../types";
import type { DecodedCueGroup, DecodedTextBox } from "./decode";

/** One editor row: Português on side a, English on side b, "" on the side a line isn't sung in. */
export interface SlideRow {
  a: string;
  b: string;
}

/** The text elements buildSlideElements (build.ts) writes on every slide, and reads back here. */
export const PORTUGUESE_BOX = "1";
export const ENGLISH_BOX = "2";

const hasText = (boxes: DecodedTextBox[]) => boxes.some((box) => box.lines.some(Boolean));

/**
 * Each slide's rows when every slide with text has exactly this app's two boxes, so the box says
 * which language a line is in and nothing has to be guessed. Lines pair by position within a
 * slide, because the export writes the same row count in both boxes, blank lines included.
 * Slides without text and rows blank in both boxes are skipped. Null for any other file, whose
 * lines still need their language guessed.
 */
export function rowsFromAppLayout(slides: DecodedTextBox[][]): SlideRow[][] | null {
  const withText = slides.filter(hasText);
  if (withText.length === 0) return null;

  const result: SlideRow[][] = [];
  for (const boxes of withText) {
    const portuguese = boxes.find((box) => box.name === PORTUGUESE_BOX);
    const english = boxes.find((box) => box.name === ENGLISH_BOX);
    if (boxes.length !== 2 || !portuguese || !english) return null;

    const rowCount = Math.max(portuguese.lines.length, english.lines.length);
    const rows = Array.from({ length: rowCount }, (_, index) => ({
      a: portuguese.lines[index] ?? "",
      b: english.lines[index] ?? "",
    }));
    result.push(rows.filter((row) => row.a || row.b));
  }
  return result;
}

/** What a file in this app's layout gives back to the editor. */
export interface AppLayoutSong {
  alignment: AlignedLine[];
  /**
   * The most rows on any slide. build.ts fills each slide of a section up to the song's lines per
   * slide, so exporting the rows again at this count splits them into the same slides, even when
   * it's below the setting the file was exported at because every section was shorter than that.
   */
  linesPerSlide: number;
}

/**
 * The editor rows of a file in this app's layout (see rowsFromAppLayout), one section per run of
 * consecutive slides in the same ProPresenter group and named after it, since build.ts writes one
 * group per section. Groups that share a name stay separate sections. A section with no group name
 * (its slide is in no group, or the group has none) takes the label `labelSections` gives its first
 * slide's lyrics: Português, or English when the slide has none. `labelSections` (alignment.ts) is
 * passed in because a runtime import of it would need the `@/` alias, which `node --test` can't load.
 * Null for a file in any other layout.
 */
export function songFromAppLayout(
  slides: DecodedTextBox[][],
  groups: (DecodedCueGroup | null)[],
  labelSections: (blocks: string[][]) => string[],
): AppLayoutSong | null {
  const kept = slides.flatMap((boxes, index) => (hasText(boxes) ? [{ boxes, group: groups[index] ?? null }] : []));
  const slideRows = rowsFromAppLayout(kept.map(({ boxes }) => boxes));
  if (!slideRows) return null;

  const guessedLabels = labelSections(
    slideRows.map((rows) => {
      const portuguese = rows.map((row) => row.a).filter(Boolean);
      return portuguese.length > 0 ? portuguese : rows.map((row) => row.b).filter(Boolean);
    }),
  );
  const alignment = slideRows.flatMap((rows, slideIndex) => {
    const { group } = kept[slideIndex];
    const continuesSection = group !== null && kept[slideIndex - 1]?.group?.index === group.index;
    return rows.map((row, rowIndex) => {
      const startsSection = rowIndex === 0 && !continuesSection;
      return {
        id: crypto.randomUUID(),
        a: row.a,
        b: row.b,
        sectionBreakBefore: startsSection,
        sectionLabel: startsSection ? group?.name || guessedLabels[slideIndex] : undefined,
      };
    });
  });
  return { alignment, linesPerSlide: Math.max(...slideRows.map((rows) => rows.length)) };
}
