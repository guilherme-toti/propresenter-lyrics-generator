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
 * Identity of a block for spotting repeats. Ignores case, accents, punctuation and spacing because
 * the same chorus pasted twice is often retyped or copied from a different source, but keeps line
 * breaks so a repeat only matches a block with the same line structure.
 */
function blockKey(block: string[]): string {
  return block.map(normalizeLine).join("\n");
}

function normalizeLine(line: string): string {
  return line
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsOf(line: string): string[] {
  return normalizeLine(line).split(" ").filter(Boolean);
}

/**
 * Labels blocks sequentially as "Verso 1", "Verso 2", ... but reuses "Refrão" (and "Refrão 2", etc.)
 * whenever a block repeats an earlier block, since that's the common shape of a song.
 */
export function labelSections(blocks: string[][]): string[] {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    const key = blockKey(block);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let verseCount = 0;
  let chorusCount = 0;
  const chorusLabelForKey = new Map<string, string>();

  return blocks.map((block) => {
    const key = blockKey(block);
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

/** A side's distinct sections, in the order each first appears, and the order they're sung in. */
function arrangementOf(blocks: string[][]): { sections: string[][]; order: number[] } {
  const indexByKey = new Map<string, number>();
  const sections: string[][] = [];
  const order = blocks.map((block) => {
    const key = blockKey(block);
    const known = indexByKey.get(key);
    if (known !== undefined) return known;
    indexByKey.set(key, sections.length);
    sections.push(block);
    return sections.length - 1;
  });
  return { sections, order };
}

/**
 * Pairs the two sides' blocks by position, except when both sides have the same distinct sections
 * and one side just writes out more repeats (a bridge sung 4× at the end, pasted once in the other
 * language). Pairing by position there shifts every pair after the first extra repeat, so instead
 * follow the fuller side's order and fill each repeat with the other side's own text for that
 * section — reusing what the user pasted, never translating.
 */
function pairBlocks(blocksA: string[][], blocksB: string[][]): { a: string[]; b: string[] }[] {
  const byPosition = () =>
    Array.from({ length: Math.max(blocksA.length, blocksB.length) }, (_, i) => ({
      a: blocksA[i] ?? [],
      b: blocksB[i] ?? [],
    }));
  if (blocksA.length === blocksB.length) return byPosition();

  const arrangementA = arrangementOf(blocksA);
  const arrangementB = arrangementOf(blocksB);
  if (arrangementA.sections.length !== arrangementB.sections.length) return byPosition();

  return blocksA.length > blocksB.length
    ? blocksA.map((a, i) => ({ a, b: arrangementB.sections[arrangementA.order[i]] }))
    : blocksB.map((b, i) => ({ a: arrangementA.sections[arrangementB.order[i]], b }));
}

/** Builds an aligned line list for manual mode, pairing blocks (see pairBlocks) and their lines. */
export function buildAlignmentFromManual(rawA: string, rawB: string): AlignedLine[] {
  const blocksA = splitIntoBlocks(rawA);
  const blocksB = splitIntoBlocks(rawB);
  const labels = labelSections(blocksA.length >= blocksB.length ? blocksA : blocksB);

  const result: AlignedLine[] = [];
  pairBlocks(blocksA, blocksB).forEach((block, i) => {
    pairLines(block.a, block.b).forEach((pair, j) => {
      result.push({
        id: crypto.randomUUID(),
        a: pair.a,
        b: pair.b,
        sectionBreakBefore: j === 0,
        sectionLabel: j === 0 ? (labels[i] ?? `Seção ${i + 1}`) : undefined,
      });
    });
  });
  return result;
}

export interface AiSection {
  label: string;
  lines: { original: string; translation: string }[];
}

type AiSide = keyof AiSection["lines"][number];

function fillBlankRepeatsOnSide(sections: AiSection[], blank: AiSide, source: AiSide): AiSection[] {
  const isBlankOn = (section: AiSection, side: AiSide) => section.lines.every((line) => line[side].trim() === "");
  const sourceKey = (section: AiSection) => blockKey(section.lines.map((line) => line[source]));

  const knownByKey = new Map<string, string[]>();
  for (const section of sections) {
    if (isBlankOn(section, blank) || isBlankOn(section, source)) continue;
    const key = sourceKey(section);
    if (!knownByKey.has(key)) knownByKey.set(key, section.lines.map((line) => line[blank]));
  }

  return sections.map((section) => {
    if (!isBlankOn(section, blank) || isBlankOn(section, source)) return section;
    const known = knownByKey.get(sourceKey(section));
    if (!known || known.length !== section.lines.length) return section;
    return { ...section, lines: section.lines.map((line, i) => ({ ...line, [blank]: known[i] })) };
  });
}

/**
 * The realign model keeps every repeat on the side that writes them out, but often leaves the other
 * side of the extra repeats blank even when told to copy it (gpt-4o, on a chorus sung 4× in English
 * and pasted once in Portuguese). Fills a section's wholly blank side from the first section whose
 * other side is the same text, so repeats don't depend on the model following that instruction.
 */
export function fillBlankRepeats(sections: AiSection[]): AiSection[] {
  return fillBlankRepeatsOnSide(fillBlankRepeatsOnSide(sections, "translation", "original"), "original", "translation");
}

/** A section's lines flattened to rows; `label` is set only on each section's first row. */
interface SectionRow {
  original: string;
  translation: string;
  label?: string;
}

function sectionsToRows(sections: AiSection[]): SectionRow[] {
  return sections.flatMap((section) =>
    section.lines.map((line, j) => ({ ...line, label: j === 0 ? section.label : undefined })),
  );
}

function rowsToSections(rows: SectionRow[]): AiSection[] {
  const sections: AiSection[] = [];
  for (const { original, translation, label } of rows) {
    if (label !== undefined || sections.length === 0) sections.push({ label: label ?? "Seção", lines: [] });
    sections[sections.length - 1].lines.push({ original, translation });
  }
  return sections;
}

/**
 * For each item of `from`, the index in `to` that a longest common subsequence pairs it with, or
 * -1. Takes the earliest match, so a section the output writes out more times than `from` maps to
 * its first copy.
 */
function matchInOrder(from: string[], to: string[]): number[] {
  const width = to.length + 1;
  const suffix = new Int32Array((from.length + 1) * width);
  for (let i = from.length - 1; i >= 0; i--) {
    for (let j = to.length - 1; j >= 0; j--) {
      suffix[i * width + j] =
        from[i] === to[j]
          ? suffix[(i + 1) * width + j + 1] + 1
          : Math.max(suffix[(i + 1) * width + j], suffix[i * width + j + 1]);
    }
  }

  const matches = new Array<number>(from.length).fill(-1);
  let i = 0;
  let j = 0;
  while (i < from.length && j < to.length) {
    if (from[i] === to[j]) {
      matches[i] = j;
      i++;
      j++;
    } else if (suffix[(i + 1) * width + j] >= suffix[i * width + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return matches;
}

function restoreDroppedLinesOnSide(rows: SectionRow[], side: AiSide, raw: string): SectionRow[] {
  const pasted = splitIntoBlocks(raw).flatMap((block, blockIndex) =>
    block.map((text) => ({ text, blockIndex, words: wordsOf(text) })),
  );
  const pastedWords = pasted.flatMap((line, lineIndex) => line.words.map((word) => ({ word, lineIndex })));
  const outputWords = rows.flatMap((row, rowIndex) => wordsOf(row[side]).map((word) => ({ word, rowIndex })));
  const matches = matchInOrder(
    pastedWords.map(({ word }) => word),
    outputWords.map(({ word }) => word),
  );

  const matchedRows: number[][] = pasted.map(() => []);
  matches.forEach((outputIndex, wordIndex) => {
    if (outputIndex !== -1) matchedRows[pastedWords[wordIndex].lineIndex].push(outputWords[outputIndex].rowIndex);
  });
  // Most of a line's words missing means the model dropped it; a merged or split line keeps them all.
  const dropped = pasted.map((line, lineIndex) => matchedRows[lineIndex].length * 2 < line.words.length);

  // matchedRows index the rows as given; `result` shifts as lines are restored into it.
  const original = rows.map((row) => ({ ...row }));
  const result = [...original];
  const rowOfLine = new Map<number, SectionRow>();
  pasted.forEach((line, lineIndex) => {
    if (!dropped[lineIndex]) {
      const hits = matchedRows[lineIndex];
      if (hits.length > 0) rowOfLine.set(lineIndex, original[hits[hits.length - 1]]);
      return;
    }

    const restored: SectionRow = { original: "", translation: "", [side]: line.text };
    const sameBlock = (other: number) => pasted[other]?.blockIndex === line.blockIndex;
    const previous = sameBlock(lineIndex - 1) ? rowOfLine.get(lineIndex - 1) : undefined;
    let nextIndex = lineIndex + 1;
    while (sameBlock(nextIndex) && (dropped[nextIndex] || matchedRows[nextIndex].length === 0)) nextIndex++;
    const next = sameBlock(nextIndex) ? original[matchedRows[nextIndex][0]] : undefined;

    if (previous) {
      result.splice(result.indexOf(previous) + 1, 0, restored);
    } else if (next) {
      restored.label = next.label;
      next.label = undefined;
      result.splice(result.indexOf(next), 0, restored);
    } else {
      // The whole pasted section is gone: bring it back as its own section, after the one before it.
      const before = [...rowOfLine.entries()].filter(([index]) => index < lineIndex).at(-1)?.[1];
      let at = before ? result.indexOf(before) + 1 : 0;
      while (before && at < result.length && result[at].label === undefined) at++;
      restored.label = "Seção";
      result.splice(at, 0, restored);
    }
    rowOfLine.set(lineIndex, restored);
  });
  return result;
}

/**
 * The realign model sometimes deletes a pasted line that has no counterpart in the other language
 * (gpt-4o dropped "Sim Sim SIM SIM" and "Yeah, yeah, yeah, yeah" on every run of the same song)
 * instead of pairing it with a blank. Puts each dropped line back next to the lines it was pasted
 * with, blank on the other side, so realigning never loses lyrics the user pasted.
 */
export function restoreDroppedLines(sections: AiSection[], rawOriginal: string, rawTranslation: string): AiSection[] {
  const rows = restoreDroppedLinesOnSide(sectionsToRows(sections), "original", rawOriginal);
  return rowsToSections(restoreDroppedLinesOnSide(rows, "translation", rawTranslation));
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

/**
 * The rows behind each block of alignmentToRaw(rows, side) once splitIntoBlocks() reads it back:
 * a blank cell renders as an empty line, which reads as a section break, and blank sections vanish.
 */
function rawBlockRows(rows: AlignedLine[], side: "a" | "b"): number[][] {
  const blocks: number[][] = [];
  let current: number[] = [];
  rows.forEach((row, index) => {
    const blank = row[side].trim() === "";
    if ((row.sectionBreakBefore || blank) && current.length > 0) {
      blocks.push(current);
      current = [];
    }
    if (!blank) current.push(index);
  });
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/**
 * Applies the editors' text to the existing alignment in place when only wording changed — each
 * side still has the shape the alignment renders it as. The text can't hold a blank cell, so
 * rebuilding from it would shift every pair after a line with no counterpart and drop the section
 * labels. Returns null when a side's shape changed and the alignment must be rebuilt from the text.
 */
export function applyRawTextEdits(rows: AlignedLine[], rawA: string, rawB: string): AlignedLine[] | null {
  let next = rows;
  for (const [side, raw] of [["a", rawA], ["b", rawB]] as const) {
    const expected = rawBlockRows(next, side);
    const blocks = splitIntoBlocks(raw);
    if (blocks.length !== expected.length || blocks.some((block, i) => block.length !== expected[i].length)) {
      return null;
    }
    const textByRow = new Map(expected.flatMap((rowIndexes, i) => rowIndexes.map((rowIndex, j) => [rowIndex, blocks[i][j]] as const)));
    next = next.map((row, index) => {
      const text = textByRow.get(index);
      return text === undefined || text === row[side] ? row : { ...row, [side]: text };
    });
  }
  return next;
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
