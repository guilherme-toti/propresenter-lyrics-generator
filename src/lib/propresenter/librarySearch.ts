import fs from "node:fs/promises";
import { decodeProFile } from "./decode";
import { listImportableFiles, type ImportableFile } from "./libraries";

/** Enough to spot the song without pushing the internet results out of the picker. */
const RESULT_LIMIT = 8;
/** Files read in parallel per step — keeps a library of thousands from opening them all at once. */
const READ_BATCH_SIZE = 32;

/**
 * Searchable lyrics per file path, kept for the server's lifetime. Decoding costs about 1 ms a
 * file, which adds up to seconds across a church library of thousands on every search; the mtime
 * check re-decodes only files ProPresenter (or this app's export) rewrote since.
 */
const lyricsCache = new Map<string, { mtimeMs: number; lyrics: string }>();

/** Accent-, case- and punctuation-blind, so "e ele" finds "É Ele" and a pasted line still matches
 * the slide text it spans, wherever ProPresenter broke it into lines or slides. */
function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

async function searchableLyrics(filePath: string): Promise<string> {
  try {
    const { mtimeMs } = await fs.stat(filePath);
    const cached = lyricsCache.get(filePath);
    if (cached?.mtimeMs === mtimeMs) return cached.lyrics;

    const { cueLines } = await decodeProFile(await fs.readFile(filePath));
    const lyrics = normalizeForSearch(cueLines.flat().join(" "));
    lyricsCache.set(filePath, { mtimeMs, lyrics });
    return lyrics;
  } catch {
    // Unreadable or not a presentation ProPresenter can open: still findable by its name.
    return "";
  }
}

/**
 * The library half of "Nova música"'s search: matches the query against each file's name and its
 * slide text, like the catalogue search matches titles and lyrics. Name matches rank first — a
 * typed title is the more deliberate signal than a word that happens to appear in a verse.
 */
export async function searchLibrary(libraryFolder: string, query: string): Promise<ImportableFile[]> {
  const needle = normalizeForSearch(query);
  if (!needle) return [];

  const files = await listImportableFiles(libraryFolder);
  const byName: ImportableFile[] = [];
  const byLyrics: ImportableFile[] = [];

  for (let start = 0; start < files.length; start += READ_BATCH_SIZE) {
    const batch = files.slice(start, start + READ_BATCH_SIZE);
    const lyrics = await Promise.all(batch.map((file) => searchableLyrics(file.path)));
    batch.forEach((file, index) => {
      if (normalizeForSearch(file.name).includes(needle)) byName.push(file);
      else if (lyrics[index].includes(needle)) byLyrics.push(file);
    });
  }

  return [...byName, ...byLyrics].slice(0, RESULT_LIMIT);
}
