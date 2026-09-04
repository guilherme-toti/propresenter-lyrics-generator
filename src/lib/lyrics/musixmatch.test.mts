import { test } from "node:test";
import assert from "node:assert/strict";
import { combineSearchResults, mapMusixmatchLanguage, pairLineAligned, type TrackCandidate } from "./musixmatch.ts";

function track(id: number, title: string, trackRating: number): TrackCandidate {
  return { commontrackId: id, title, artist: "Artist", language: "pt", trackRating };
}

test("promotes the most popular lyrics match to the front", () => {
  // Real data from probing the API for "estou preparando um caminho": the site's own search
  // shows "É Ele" — Drops INA as the best result, but it only ranks 7th by raw relevance.
  const byLyrics = [
    track(1, "É Ele — Nicolas Henrique", 1),
    track(2, "Fala Comigo Deus", 3),
    track(3, "Procurando", 11),
    track(4, "É Ele — Grace & Metal", 1),
    track(5, "Diversidade", 3),
    track(6, "Um Dia — Caetano Veloso", 39),
    track(7, "É Ele — Drops INA", 57),
  ];

  const result = combineSearchResults(byLyrics, []);

  assert.equal(result[0].commontrackId, 7);
});

test("leaves an already-best match at the front untouched", () => {
  const byLyrics = [track(1, "Best", 100), track(2, "Second", 10)];

  const result = combineSearchResults(byLyrics, []);

  assert.deepEqual(result.map((t) => t.commontrackId), [1, 2]);
});

test("interleaves title and lyrics results after promotion, deduping by id", () => {
  const byLyrics = [track(1, "L1", 5), track(2, "L2", 1)];
  const byTitle = [track(3, "T1", 1), track(2, "T-dup", 1)];

  const result = combineSearchResults(byLyrics, byTitle);

  assert.deepEqual(result.map((t) => t.commontrackId), [1, 3, 2]);
});

test("handles empty inputs", () => {
  assert.deepEqual(combineSearchResults([], []), []);
});

test("mapMusixmatchLanguage maps bare and regional codes to a church language", () => {
  assert.equal(mapMusixmatchLanguage("en"), "English");
  assert.equal(mapMusixmatchLanguage("en-US"), "English");
  assert.equal(mapMusixmatchLanguage("pt"), "Português (Brasil)");
  assert.equal(mapMusixmatchLanguage("pt-br"), "Português (Brasil)");
  assert.equal(mapMusixmatchLanguage("pt-PT"), "Português (Brasil)");
});

test("mapMusixmatchLanguage returns null for unknown or empty tags", () => {
  assert.equal(mapMusixmatchLanguage(""), null);
  assert.equal(mapMusixmatchLanguage("es"), null);
  assert.equal(mapMusixmatchLanguage("fr-FR"), null);
});

test("pairLineAligned zips matching sections and lines by position", () => {
  const original = "Line one\nLine two\n\nChorus line";
  const translated = "Linha um\nLinha dois\n\nLinha do refrão";

  const result = pairLineAligned(original, translated);

  assert.deepEqual(result, [
    { label: "Parte 1", lines: [
      { original: "Line one", translation: "Linha um" },
      { original: "Line two", translation: "Linha dois" },
    ] },
    { label: "Parte 2", lines: [
      { original: "Chorus line", translation: "Linha do refrão" },
    ] },
  ]);
});

test("pairLineAligned returns null when section counts differ", () => {
  const original = "Line one\n\nLine two";
  const translated = "Linha um";

  assert.equal(pairLineAligned(original, translated), null);
});

test("pairLineAligned returns null when a section's line count differs", () => {
  const original = "Line one\nLine two";
  const translated = "Linha um";

  assert.equal(pairLineAligned(original, translated), null);
});

test("pairLineAligned returns null for empty input", () => {
  assert.equal(pairLineAligned("", ""), null);
});
