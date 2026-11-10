import { z } from "zod";
import { detectLine } from "@/lib/propresenter/languageDetect";
import { sanitizeFileBaseName } from "@/lib/propresenter/encode";
import { fileNamesMatch } from "@/lib/propresenter/libraries";
import { normalizeForSearch } from "@/lib/propresenter/librarySearchMatch";

/** One library file as `export` writes it to `songs/<id>.json`, for an agent to research. */
export const exportedSongSchema = z.object({
  id: z.string().min(1),
  library: z.string().min(1),
  libraryPath: z.string().min(1),
  fileName: z.string().min(1),
  title: z.string(),
  artist: z.string(),
  /** Heuristic only (see classifyCueLines): whether the slides already mix both languages. */
  bilingual: z.boolean(),
  /** Each slide's text lines, in document order. */
  slides: z.array(z.array(z.string())),
});
export type ExportedSong = z.infer<typeof exportedSongSchema>;

/** Where one language column's lines came from. */
const sideSchema = z
  .object({
    /** "file": kept from the .pro as it was. "web": copied from a page saved by `page`. */
    origin: z.enum(["file", "web"]),
    /** The recorded version in this language. Left out when this column is the file's own
     * translation and no recording of it exists. */
    title: z.string().trim().min(1).optional(),
    artist: z.string().trim().min(1).optional(),
    /** The saved page every line of a "web" column was copied from: `sources/<id>/<n>.txt`. */
    source: z.string().trim().min(1).optional(),
  })
  .refine((side) => side.origin === "file" || side.source, {
    message: "a web column needs the saved page its lines came from",
  });

const sectionSchema = z.object({
  /** In Portuguese: "Verso 1", "Pré-Refrão", "Refrão", "Ponte", "Final"… */
  label: z.string().trim().min(1),
  /** [Português, English] — Português is always first, like Editor A in the app. */
  lines: z.array(z.tuple([z.string(), z.string()])).min(1),
});

/** The song as first written and recorded, whatever language the file is in: what tells two files
 * of the same song apart from two songs. */
const originalSchema = z.object({
  title: z.string().trim().min(1),
  artist: z.string().trim().min(1),
  language: z.enum(["pt", "en"]),
});

const okResultSchema = z
  .object({
    status: z.literal("ok"),
    original: originalSchema,
    /** The song's most known artist, the only one the file credits. */
    artist: z.string().trim().min(1),
    pt: sideSchema.nullable(),
    en: sideSchema.nullable(),
    sections: z.array(sectionSchema).min(1),
    /** Every page used to identify the song and find its versions. */
    sources: z.array(z.url()).default([]),
    notes: z.string().default(""),
  })
  .refine((result) => result.pt?.title || result.en?.title, {
    message: "an identified song needs the title of at least one recorded version",
  });

export const FOLLOW_UP_REASONS = [
  "not-found",
  "versions-differ",
  "lyrics-unavailable",
  "file-differs",
  "alignment-uncertain",
  "other",
] as const;

const followUpResultSchema = z.object({
  status: z.literal("followup"),
  /** Left out only when the song couldn't be identified. */
  original: originalSchema.optional(),
  reason: z.enum(FOLLOW_UP_REASONS),
  /** What the person fixing it by hand needs: the versions found, what differs, which pages. */
  details: z.string().trim().min(1),
  sources: z.array(z.url()).default([]),
});

export const auditResultSchema = z.discriminatedUnion("status", [okResultSchema, followUpResultSchema]);
export type AuditResult = z.infer<typeof auditResultSchema>;
export type OkResult = z.infer<typeof okResultSchema>;
type Column = 0 | 1;

/** "Oceanos - Oceans": every recorded version's title, Português first, each named once. */
export function finalTitle(result: OkResult): string {
  const titles: string[] = [];
  for (const title of [result.pt?.title, result.en?.title]) {
    if (title && !titles.some((known) => normalizeForSearch(known) === normalizeForSearch(title))) {
      titles.push(title);
    }
  }
  return titles.join(" - ");
}

export function finalFileName(result: OkResult): string {
  return `${sanitizeFileBaseName(finalTitle(result))}.pro`;
}

/** Whether `line` appears in `text` as whole words, blind to accents, case, punctuation and line
 * breaks — so a slide line that joins or splits the page's lines still counts as copied. */
function appearsIn(line: string, normalizedText: string): boolean {
  const needle = normalizeForSearch(line);
  return needle === "" || ` ${normalizedText} `.includes(` ${needle} `);
}

/** Above this share of rows with one column blank, the alignment is probably off. */
const MAX_BLANK_SHARE = 0.15;

export interface CheckOutcome {
  errors: string[];
  warnings: string[];
}

/**
 * Checks an agent's result against the file it came from and the pages it saved. Errors block
 * `apply`; warnings are listed in the report for a person to look at, because the language
 * heuristic is a word count, so a short line can still be misread (an English line made of words both
 * languages share).
 *
 * `readSource` returns a saved page's text, or null when the path doesn't exist.
 */
export function checkResult(
  song: ExportedSong,
  result: AuditResult,
  readSource: (relativePath: string) => string | null,
): CheckOutcome {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (result.status === "followup") return { errors, warnings };

  const rows = result.sections.flatMap((section) => section.lines);
  const fileText = normalizeForSearch(song.slides.flat().join("\n"));
  const sides = [
    { column: 0 as Column, name: "Português", side: result.pt, wrongLanguage: "en" },
    { column: 1 as Column, name: "English", side: result.en, wrongLanguage: "pt" },
  ];

  rows.forEach((row, index) => {
    if (!row[0].trim() && !row[1].trim()) errors.push(`row ${index + 1} is empty on both sides`);
  });

  for (const { column, name, side, wrongLanguage } of sides) {
    const lines = rows.map((row) => row[column].trim()).filter(Boolean);

    if (!side) {
      if (lines.length > 0) errors.push(`${name} column has lines but no source (set "${column === 0 ? "pt" : "en"}")`);
      continue;
    }
    if (lines.length === 0) {
      errors.push(`${name} column is empty but has a source`);
      continue;
    }

    const originText = side.origin === "file" ? fileText : readSavedSource(side.source, readSource, name, errors);
    if (originText !== null) {
      const missing = lines.filter((line) => !appearsIn(line, originText));
      for (const line of missing) {
        errors.push(`${name} line not found in its ${side.origin === "file" ? "file" : "saved page"}: "${line}"`);
      }
    }

    for (const line of lines) {
      if (detectLine(line) === wrongLanguage) warnings.push(`${name} column line looks like the other language: "${line}"`);
    }
  }

  if (result.pt && result.en) {
    const halfBlank = rows.filter((row) => !row[0].trim() !== !row[1].trim()).length;
    if (rows.length > 0 && halfBlank / rows.length > MAX_BLANK_SHARE) {
      warnings.push(`${halfBlank} of ${rows.length} rows have one side blank — check the alignment`);
    }
  }

  const keptFromFile = sides.filter(({ side }) => side?.origin === "file").map(({ column }) => column);
  if (keptFromFile.length > 0) {
    const kept = normalizeForSearch(rows.flatMap((row) => keptFromFile.map((column) => row[column])).join("\n"));
    const dropped = [...new Set(song.slides.flat())].filter((line) => {
      const language = detectLine(line);
      const column = language === "pt" ? 0 : language === "en" ? 1 : null;
      return column !== null && keptFromFile.includes(column) && !appearsIn(line, kept);
    });
    for (const line of dropped) warnings.push(`file line left out: "${line}"`);
  }

  // A chorus sung four times would otherwise report the same line four times.
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

function readSavedSource(
  source: string | undefined,
  readSource: (relativePath: string) => string | null,
  name: string,
  errors: string[],
): string | null {
  const text = source ? readSource(source) : null;
  if (text === null) {
    errors.push(`${name} column's saved page is missing: ${source ?? "(none)"}`);
    return null;
  }
  return normalizeForSearch(text);
}

export interface CheckedSong {
  song: ExportedSong;
  result: OkResult;
}

/** Files in one library that end up as the same song: one is written, the rest are replaced. */
export interface MergeGroup {
  library: string;
  libraryPath: string;
  fileName: string;
  primary: CheckedSong;
  members: CheckedSong[];
}

/** Rows with one column blank — fewer means a more complete pair. */
function blankCells(result: OkResult): number {
  return result.sections.flatMap((section) => section.lines).filter((row) => !row[0].trim() || !row[1].trim()).length;
}

function rowCount(result: OkResult): number {
  return result.sections.reduce((total, section) => total + section.lines.length, 0);
}

/** Bilingual first, then the fullest song (every repeat written out, as sung), then the most
 * complete pair, then by id, so the same input always picks the same file. */
function comparePrimary(a: CheckedSong, b: CheckedSong): number {
  const bilingual = (entry: CheckedSong) => (entry.result.pt && entry.result.en ? 0 : 1);
  return (
    bilingual(a) - bilingual(b) ||
    rowCount(b.result) - rowCount(a.result) ||
    blankCells(a.result) - blankCells(b.result) ||
    a.song.id.localeCompare(b.song.id)
  );
}

/** Groups songs by the file they'll be written to. A group of two or more is the same song kept
 * twice — an English-only "Oceans" and a Português-only "Oceanos" both become "Oceanos - Oceans". */
export function planMergeGroups(entries: CheckedSong[]): MergeGroup[] {
  const groups: MergeGroup[] = [];
  for (const entry of entries) {
    const fileName = finalFileName(entry.result);
    const group = groups.find(
      (known) => known.libraryPath === entry.song.libraryPath && fileNamesMatch(known.fileName, fileName),
    );
    if (group) group.members.push(entry);
    else groups.push({ library: entry.song.library, libraryPath: entry.song.libraryPath, fileName, primary: entry, members: [entry] });
  }
  for (const group of groups) group.primary = [...group.members].sort(comparePrimary)[0];
  return groups;
}

export interface ResearchedSong {
  song: ExportedSong;
  result: AuditResult;
}

/** "Oceans (Where Feet May Fail)" and "Oceans" by "Hillsong United" are one song: subtitles in
 * brackets and case don't tell songs apart. */
function originalKey(entry: ResearchedSong): string | null {
  const original = entry.result.original;
  if (!original) return null;
  const title = normalizeForSearch(original.title.replace(/\s*[([].*?[)\]]/g, ""));
  return `${entry.song.libraryPath}\n${title}\n${normalizeForSearch(original.artist)}`;
}

/**
 * Files in one library that are the same original song but won't become one file on their own —
 * one is a follow-up, or they were given different names. Each file is researched alone, so two
 * files of the same song can reach different answers; a person settles them together.
 */
export function unmergedDuplicates(entries: ResearchedSong[]): ResearchedSong[][] {
  const byOriginal = new Map<string, ResearchedSong[]>();
  for (const entry of entries) {
    const key = originalKey(entry);
    if (key) byOriginal.set(key, [...(byOriginal.get(key) ?? []), entry]);
  }
  return [...byOriginal.values()].filter((group) => {
    if (group.length < 2) return false;
    const names = group.map((entry) => (entry.result.status === "ok" ? finalFileName(entry.result) : null));
    return names.some((name) => name === null || !fileNamesMatch(name, names[0] ?? ""));
  });
}

/** A filesystem-safe, readable id for a file: "É Ele.pro" → "e-ele". */
export function songIdFor(fileName: string, taken: Set<string>): string {
  const base = normalizeForSearch(fileName.replace(/\.pro$/i, "")).replace(/ /g, "-") || "song";
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  taken.add(id);
  return id;
}
