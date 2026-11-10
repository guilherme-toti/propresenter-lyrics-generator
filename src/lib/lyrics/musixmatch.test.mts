import { afterEach, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { answerWith, silenceConsoleError } from "../testing/fetchMock.mts";
import {
  combineSearchResults,
  fetchLyricsByTrackId,
  mapMusixmatchLanguage,
  pairLineAligned,
  searchTracks,
  type TrackCandidate,
} from "./musixmatch.ts";

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

/** Musixmatch answers HTTP 200 and puts the real status in the envelope: probed with a bogus key,
 * track.search came back 200 with `status_code: 401` and an empty body. */
function envelope(statusCode: number, tracks: { commontrack_id: number; track_name: string }[] = []) {
  return {
    message: {
      header: { status_code: statusCode },
      body: statusCode === 200 ? { track_list: tracks.map((track) => ({ track })) } : [],
    },
  };
}

describe("searchTracks", () => {
  const savedKey = process.env.MUSIXMATCH_API_KEY;

  beforeEach(() => {
    process.env.MUSIXMATCH_API_KEY = "test-key";
    silenceConsoleError();
  });

  afterEach(() => {
    mock.restoreAll();
    if (savedKey === undefined) delete process.env.MUSIXMATCH_API_KEY;
    else process.env.MUSIXMATCH_API_KEY = savedKey;
  });

  test("answers an empty list when the catalogue really has no match", async () => {
    answerWith(200, envelope(200));

    assert.deepEqual(await searchTracks("zzqxvbnm"), []);
  });

  test("says the key is missing, and where to add it, instead of answering an empty list", async () => {
    delete process.env.MUSIXMATCH_API_KEY;

    await assert.rejects(searchTracks("oceans"), {
      name: "MusixmatchError",
      code: "not-configured",
      message: /chave da Musixmatch em Ajustes/,
    });
  });

  test("says Musixmatch refused the key", async () => {
    answerWith(200, envelope(401));

    await assert.rejects(searchTracks("oceans"), { code: "key-rejected", message: /Ajustes/ });
  });

  test("says the plan's limit was reached", async () => {
    answerWith(200, envelope(402));

    await assert.rejects(searchTracks("oceans"), { code: "quota" });
  });

  test("says Musixmatch couldn't be reached", async () => {
    mock.method(globalThis, "fetch", async () => {
      throw new TypeError("fetch failed");
    });

    await assert.rejects(searchTracks("oceans"), { code: "unavailable" });
  });

  test("keeps one search's matches when only the other fails", async () => {
    mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.searchParams.has("q_lyrics")) throw new TypeError("fetch failed");
      return Response.json(envelope(200, [{ commontrack_id: 1, track_name: "Oceans" }]));
    });

    const results = await searchTracks("oceans");

    assert.deepEqual(results.map((t) => t.commontrackId), [1]);
  });

  test("leaves the lyrics lookups answering null, so their callers still fall back", async () => {
    mock.method(globalThis, "fetch", async () => {
      throw new TypeError("fetch failed");
    });
    assert.equal(await fetchLyricsByTrackId(1), null);

    delete process.env.MUSIXMATCH_API_KEY;
    assert.equal(await fetchLyricsByTrackId(1), null);
  });
});
