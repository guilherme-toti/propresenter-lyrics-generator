import { test } from "node:test";
import assert from "node:assert/strict";
import { combineSearchResults, type TrackCandidate } from "./musixmatch.ts";

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
