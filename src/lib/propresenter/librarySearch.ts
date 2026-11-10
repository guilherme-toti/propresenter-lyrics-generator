import fs from "node:fs/promises";
import { decodeProFile } from "./decode";
import { listImportableFiles, type ImportableFile } from "./libraries";
import { libraryMatcher, normalizeForSearch } from "./librarySearchMatch";

/** Enough to spot the song without pushing the internet results out of the picker. */
const RESULT_LIMIT = 8;
/** Files read in parallel per step — keeps a library of thousands from opening them all at once. */
const READ_BATCH_SIZE = 32;

/** What a file holds beyond its name, already through normalizeForSearch. */
interface SearchableContent {
  credits: string;
  lyrics: string;
}

const UNREADABLE: SearchableContent = { credits: "", lyrics: "" };

/**
 * Searchable credits and lyrics per file path, kept for the server's lifetime. Decoding costs about
 * 1 ms a file, which adds up to seconds across a church library of thousands on every search; the
 * mtime check re-decodes only files ProPresenter (or this app's export) rewrote since.
 */
const contentCache = new Map<string, SearchableContent & { mtimeMs: number }>();

async function searchableContent(filePath: string): Promise<SearchableContent> {
  try {
    const { mtimeMs } = await fs.stat(filePath);
    const cached = contentCache.get(filePath);
    if (cached?.mtimeMs === mtimeMs) return cached;

    const { author, artistCredits, cueLines } = await decodeProFile(await fs.readFile(filePath));
    const content: SearchableContent = {
      credits: normalizeForSearch(`${author} ${artistCredits}`),
      lyrics: normalizeForSearch(cueLines.flat().join(" ")),
    };
    contentCache.set(filePath, { ...content, mtimeMs });
    return content;
  } catch {
    // Unreadable or not a presentation ProPresenter can open: still findable by its name.
    return UNREADABLE;
  }
}

/**
 * The library half of "Procurar música"'s search: matches the query against each file's name, the
 * artist credited in it and its slide text, since people type the same "title + artist" they'd
 * give the catalogue search. See libraryMatcher for what ranks first.
 */
export async function searchLibrary(libraryFolder: string, query: string): Promise<ImportableFile[]> {
  const matchTier = libraryMatcher(query);
  if (!matchTier) return [];

  const files = await listImportableFiles(libraryFolder);
  const matches: { file: ImportableFile; tier: number }[] = [];

  for (let start = 0; start < files.length; start += READ_BATCH_SIZE) {
    const batch = files.slice(start, start + READ_BATCH_SIZE);
    const contents = await Promise.all(batch.map((file) => searchableContent(file.path)));
    batch.forEach((file, index) => {
      const tier = matchTier({ name: normalizeForSearch(file.name), ...contents[index] });
      if (tier !== undefined) matches.push({ file, tier });
    });
  }

  // The sort is stable, so each tier keeps the files' alphabetical order.
  return matches
    .sort((a, b) => a.tier - b.tier)
    .slice(0, RESULT_LIMIT)
    .map(({ file }) => file);
}
