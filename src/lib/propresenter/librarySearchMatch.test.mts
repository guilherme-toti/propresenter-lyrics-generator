import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryMatcher, normalizeForSearch, type SearchableSong } from "./librarySearchMatch.ts";

interface LibraryFile {
  name: string;
  credits?: string;
  lyrics?: string;
}

/** Names of the files `query` finds, best match first — the order searchLibrary lists them in. */
function search(query: string, files: LibraryFile[]): string[] {
  const matchTier = libraryMatcher(query);
  if (!matchTier) return [];
  return files
    .map((file) => {
      const song: SearchableSong = {
        name: normalizeForSearch(file.name),
        credits: normalizeForSearch(file.credits ?? ""),
        lyrics: normalizeForSearch(file.lyrics ?? ""),
      };
      return { name: file.name, tier: matchTier(song) };
    })
    .filter((match): match is { name: string; tier: number } => match.tier !== undefined)
    .sort((a, b) => a.tier - b.tier)
    .map((match) => match.name);
}

test("finds a song saved without an artist when the query adds one", () => {
  // The reported case: "Oceans" in the library, no author, searched the way the catalogue wants it.
  const library = [{ name: "Oceans" }];
  for (const query of ["oceans Hillsong", "Hillsong oceans", "Oceans do Hillsong", "Oceans by Hillsong"]) {
    assert.deepEqual(search(query, library), ["Oceans"], query);
  }
});

test("finds a credited song by title and artist in any order", () => {
  const library = [{ name: "Oceans (Where Feet May Fail)", credits: "Hillsong United" }];
  for (const query of ["oceans hillsong", "hillsong oceans", "Oceans do Hillsong", "hillsong"]) {
    assert.deepEqual(search(query, library), ["Oceans (Where Feet May Fail)"], query);
  }
});

test("matches a word still being typed", () => {
  const library = [{ name: "Oceans", credits: "Hillsong United" }];
  assert.deepEqual(search("ocea", library), ["Oceans"]);
  assert.deepEqual(search("oceans hills", library), ["Oceans"]);
});

test("keeps accent- and case-blind name and lyric matches", () => {
  const library = [
    { name: "É Ele" },
    { name: "Preparai o Caminho", lyrics: "Estou preparando\num caminho" },
  ];
  assert.deepEqual(search("e ele", library), ["É Ele"]);
  assert.deepEqual(search("estou preparando um caminho", library), ["Preparai o Caminho"]);
});

test("lists name and credit matches above lyric matches", () => {
  const library = [
    { name: "Grandes Coisas", lyrics: "oceans rise" },
    { name: "Oceans", credits: "Hillsong" },
  ];
  assert.deepEqual(search("oceans", library), ["Oceans", "Grandes Coisas"]);
  assert.deepEqual(search("hillsong oceans", library), ["Oceans"]);
});

test("lists the song a pasted line comes from above files named after one of its words", () => {
  const library = [{ name: "Caminho" }, { name: "Preparai", lyrics: "estou preparando um caminho" }];
  assert.deepEqual(search("estou preparando um caminho", library), ["Preparai", "Caminho"]);
});

test("does not find a name inside a longer word of the query", () => {
  assert.deepEqual(search("elevado hillsong", [{ name: "Ele" }]), []);
});

test("does not let a linking word alone match every song", () => {
  const library = [{ name: "Oceans", credits: "Hillsong" }, { name: "Rio de Deus" }];
  assert.deepEqual(search("de", library), ["Rio de Deus"]);
});

test("has nothing to search for a query of only punctuation", () => {
  assert.equal(libraryMatcher("  ?! "), null);
});
