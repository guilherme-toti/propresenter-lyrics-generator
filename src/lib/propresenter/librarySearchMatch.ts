/** Which library files "Procurar música"'s search finds, and in what order. Nothing imported, so
 * `node --test` can load it. */

/** Accent-, case- and punctuation-blind, so "e ele" finds "É Ele" and a pasted line still matches
 * the slide text it spans, wherever ProPresenter broke it into lines or slides. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** One library file's searchable text, each part already through normalizeForSearch. */
export interface SearchableSong {
  name: string;
  /** The CCLI author and artist kept in the file — this app's export writes the artist there. */
  credits: string;
  lyrics: string;
}

/** Words that join a title to its artist — "Oceans do Hillsong", "Oceans by Hillsong" — which
 * neither the title nor the credits hold. */
const LINKING_WORDS = new Set(["de", "do", "da", "dos", "das", "by"]);

/** Whether a word of `text` starts with `word`, so "hills" already finds "Hillsong" mid-typing. */
function hasWordStartingWith(text: string, word: string): boolean {
  return ` ${text}`.includes(` ${word}`);
}

/**
 * Matches one search against library files: the returned function gives a file's tier, lower
 * listing first, or undefined to leave the file out. Null when the query has nothing to search.
 */
export function libraryMatcher(query: string): ((song: SearchableSong) => number | undefined) | null {
  const text = normalizeForSearch(query);
  if (!text) return null;
  const words = text.split(" ").filter((word) => !LINKING_WORDS.has(word));

  const tiers: ((song: SearchableSong) => boolean)[] = [
    // The name holds what was typed, even halfway through typing it ("ocea").
    (song) => song.name.includes(text),
    // Every word in the name or credits, in any order: "hillsong oceans" for a credited song.
    (song) => words.length > 0 && words.every((word) => hasWordStartingWith(`${song.name} ${song.credits}`, word)),
    // A pasted line. Below the name and credits: a typed title is the more deliberate signal.
    (song) => song.lyrics.includes(text),
    // The whole name plus words the file doesn't hold, like the artist of a song saved without
    // one: "oceans hillsong" finds "Oceans". Last, so a pasted line doesn't put every file named
    // after one of its words above the song it comes from.
    (song) => song.name !== "" && ` ${text} `.includes(` ${song.name} `),
  ];

  return (song) => {
    const tier = tiers.findIndex((matches) => matches(song));
    return tier === -1 ? undefined : tier;
  };
}
