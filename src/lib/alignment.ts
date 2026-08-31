import type { AlignedLine } from "./types";

/** Splits raw pasted lyrics into blocks (sections) separated by one or more blank lines. */
export function splitIntoBlocks(raw: string): string[][] {
  return raw
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    )
    .filter((block) => block.length > 0);
}

/**
 * Labels blocks sequentially as "Verso 1", "Verso 2", ... but reuses "Refrão" (and "Refrão 2", etc.)
 * whenever a block's text exactly repeats an earlier block, since that's the common shape of a song.
 */
export function labelSections(blocks: string[][]): string[] {
  const keyOf = (block: string[]) => block.join("\n").toLowerCase();

  const counts = new Map<string, number>();
  for (const block of blocks) {
    const key = keyOf(block);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let verseCount = 0;
  let chorusCount = 0;
  const chorusLabelForKey = new Map<string, string>();

  return blocks.map((block) => {
    const key = keyOf(block);
    if ((counts.get(key) ?? 0) > 1) {
      let chorusLabel = chorusLabelForKey.get(key);
      if (!chorusLabel) {
        chorusCount += 1;
        chorusLabel = chorusCount === 1 ? "Refrão" : `Refrão ${chorusCount}`;
        chorusLabelForKey.set(key, chorusLabel);
      }
      return chorusLabel;
    }
    verseCount += 1;
    return `Verso ${verseCount}`;
  });
}

function pairLines(linesA: string[], linesB: string[]): { a: string; b: string }[] {
  const length = Math.max(linesA.length, linesB.length);
  const pairs: { a: string; b: string }[] = [];
  for (let i = 0; i < length; i++) {
    pairs.push({ a: linesA[i] ?? "", b: linesB[i] ?? "" });
  }
  return pairs;
}

/** Builds an aligned line list for manual mode by pairing blocks and lines index-wise. */
export function buildAlignmentFromManual(rawA: string, rawB: string): AlignedLine[] {
  const blocksA = splitIntoBlocks(rawA);
  const blocksB = splitIntoBlocks(rawB);
  const blockCount = Math.max(blocksA.length, blocksB.length);
  const labels = labelSections(blocksA.length >= blocksB.length ? blocksA : blocksB);

  const result: AlignedLine[] = [];
  for (let i = 0; i < blockCount; i++) {
    const linesA = blocksA[i] ?? [];
    const linesB = blocksB[i] ?? [];
    const pairs = pairLines(linesA, linesB);
    pairs.forEach((pair, j) => {
      result.push({
        id: crypto.randomUUID(),
        a: pair.a,
        b: pair.b,
        sectionBreakBefore: j === 0,
        sectionLabel: j === 0 ? (labels[i] ?? `Seção ${i + 1}`) : undefined,
      });
    });
  }
  return result;
}

export interface AiSection {
  label: string;
  lines: { original: string; translation: string }[];
}

/** Converts an AI-generated, already-aligned response directly into AlignedLine rows. */
export function buildAlignmentFromAiSections(sections: AiSection[]): AlignedLine[] {
  const result: AlignedLine[] = [];
  for (const section of sections) {
    section.lines.forEach((line, j) => {
      result.push({
        id: crypto.randomUUID(),
        a: line.original,
        b: line.translation,
        sectionBreakBefore: j === 0,
        sectionLabel: j === 0 ? section.label : undefined,
      });
    });
  }
  return result;
}

/** Splits an aligned line list into per-slide chunks, never mixing rows from two sections on one slide. */
export function groupIntoSlides(alignment: AlignedLine[], linesPerSlide: number): AlignedLine[][] {
  const perSlide = Math.max(1, linesPerSlide);
  const slides: AlignedLine[][] = [];
  let current: AlignedLine[] = [];

  for (const line of alignment) {
    const startsNewSection = line.sectionBreakBefore && current.length > 0;
    if (startsNewSection || current.length >= perSlide) {
      slides.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) slides.push(current);
  return slides;
}

/**
 * Reconstructs the blank-line-separated raw text for one side from the current alignment, so the
 * editor textareas always reflect edits made directly in the alignment preview (text changes,
 * reordering, inserted/removed rows, section splits) without requiring a manual re-align.
 */
export function alignmentToRaw(rows: AlignedLine[], side: "a" | "b"): string {
  const sections: string[][] = [];
  rows.forEach((row) => {
    if (row.sectionBreakBefore || sections.length === 0) {
      sections.push([]);
    }
    sections[sections.length - 1].push(row[side]);
  });
  return sections.map((lines) => lines.join("\n")).join("\n\n");
}

// --- Row editing helpers (pure functions operating on an AlignedLine[]) ---

export function updateRowText(rows: AlignedLine[], id: string, side: "a" | "b", value: string): AlignedLine[] {
  return rows.map((row) => (row.id === id ? { ...row, [side]: value } : row));
}

export function updateSectionLabel(rows: AlignedLine[], id: string, label: string): AlignedLine[] {
  return rows.map((row) => (row.id === id ? { ...row, sectionLabel: label } : row));
}

export function insertRowAfter(rows: AlignedLine[], id: string): AlignedLine[] {
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return rows;
  const next: AlignedLine = { id: crypto.randomUUID(), a: "", b: "", sectionBreakBefore: false };
  return [...rows.slice(0, index + 1), next, ...rows.slice(index + 1)];
}

export function deleteRow(rows: AlignedLine[], id: string): AlignedLine[] {
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) return rows;
  const removed = rows[index];
  const next = rows.slice(0, index).concat(rows.slice(index + 1));
  // If we removed a section-starting row, move its section marker to the row that takes its place.
  if (removed.sectionBreakBefore && next[index]) {
    next[index] = { ...next[index], sectionBreakBefore: true, sectionLabel: removed.sectionLabel };
  }
  return next;
}

/**
 * Moves a row up or down by swapping its content (id/a/b) with its neighbor, while leaving each
 * index's own sectionBreakBefore/sectionLabel in place. A section divider is anchored to a
 * position in the list, not to whichever row object happens to sit there — otherwise moving a row
 * across a section boundary would drag the boundary along with the row it swapped past, and the
 * row could never become the first line of the section it moved into.
 *
 * That index-anchoring only works when the row changing position doesn't itself carry the
 * boundary. If it does — i.e. it's the first row of its section and it's moving up, out of that
 * section — a plain adjacent swap has no third row to hand the marker to, so it would wrongly
 * attach "first of this section" to whatever was in the previous section instead. In that case,
 * hand the marker off to the row right after it (the new first line of the section it's leaving).
 */
export function moveRow(rows: AlignedLine[], id: string, direction: "up" | "down"): AlignedLine[] {
  const index = rows.findIndex((row) => row.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= rows.length) return rows;

  const moving = rows[index];
  const other = rows[swapWith];
  const next = [...rows];
  const contentAt = ({ id, a, b }: AlignedLine) => ({ id, a, b });

  if (direction === "up" && moving.sectionBreakBefore && !other.sectionBreakBefore) {
    const successor = rows[index + 1];
    if (successor && !successor.sectionBreakBefore) {
      next[index + 1] = { ...successor, sectionBreakBefore: true, sectionLabel: moving.sectionLabel };
    }
    next[index] = { ...other, sectionBreakBefore: false, sectionLabel: undefined };
    next[swapWith] = { ...moving, sectionBreakBefore: false, sectionLabel: undefined };
    return next;
  }

  next[index] = { ...next[index], ...contentAt(other) };
  next[swapWith] = { ...next[swapWith], ...contentAt(moving) };
  return next;
}

export function toggleSectionBreak(rows: AlignedLine[], id: string): AlignedLine[] {
  return rows.map((row) =>
    row.id === id
      ? {
          ...row,
          sectionBreakBefore: !row.sectionBreakBefore,
          sectionLabel: !row.sectionBreakBefore ? (row.sectionLabel ?? "Seção") : undefined,
        }
      : row,
  );
}
