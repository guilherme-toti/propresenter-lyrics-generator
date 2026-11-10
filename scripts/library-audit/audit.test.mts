import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditResultSchema,
  checkResult,
  finalFileName,
  finalTitle,
  planMergeGroups,
  songIdFor,
  unmergedDuplicates,
  type ExportedSong,
  type OkResult,
} from "./audit.ts";

function song(overrides: Partial<ExportedSong> = {}): ExportedSong {
  return {
    id: "oceanos",
    library: "Louvor",
    libraryPath: "/libs/Louvor",
    fileName: "Oceanos.pro",
    title: "Oceanos",
    artist: "",
    bilingual: true,
    slides: [
      ["TU ME CHAMAS SOBRE AS ÁGUAS", "ONDE OS MEUS PÉS PODEM FALHAR", "YOU CALL ME ON THE WATER", "WHERE MY FEET CAN FAIL"],
    ],
    ...overrides,
  };
}

function okResult(overrides: Partial<Record<string, unknown>> = {}): OkResult {
  const parsed = auditResultSchema.parse({
    status: "ok",
    original: { title: "Oceans (Where Feet May Fail)", artist: "Hillsong UNITED", language: "en" },
    artist: "Hillsong UNITED",
    pt: { origin: "file", title: "Oceanos", artist: "Hillsong UNITED" },
    en: { origin: "web", title: "Oceans (Where Feet May Fail)", artist: "Hillsong UNITED", source: "sources/oceanos/1.txt" },
    sections: [
      {
        label: "Verso 1",
        lines: [
          ["Tu me chamas sobre as águas", "You call me out upon the waters"],
          ["Onde os meus pés podem falhar", "The great unknown where feet may fail"],
        ],
      },
    ],
    ...overrides,
  });
  assert.equal(parsed.status, "ok");
  return parsed as OkResult;
}

const officialPage =
  "URL: https://example.com/oceans\nTitle: Oceans\n\nMenu\nYou call me out upon the waters\nThe great unknown where feet may fail\nAnd there I find You in the mystery";
const pages = (texts: Record<string, string>) => (relativePath: string) => texts[relativePath] ?? null;

test("names the file after every recorded version, Português first", () => {
  assert.equal(finalTitle(okResult()), "Oceanos - Oceans (Where Feet May Fail)");
  assert.equal(finalFileName(okResult()), "Oceanos - Oceans (Where Feet May Fail).pro");
});

test("names a version once when both languages share its title", () => {
  const result = okResult({
    pt: { origin: "file", title: "Oceans" },
    en: { origin: "web", title: "oceans", source: "sources/oceanos/1.txt" },
  });
  assert.equal(finalTitle(result), "Oceans");
});

test("leaves the file's own translation out of the name", () => {
  const result = okResult({ en: { origin: "file" } });
  assert.equal(finalTitle(result), "Oceanos");
});

test("passes lines kept from the file and lines copied from the saved page", () => {
  const outcome = checkResult(song(), okResult(), pages({ "sources/oceanos/1.txt": officialPage }));
  assert.deepEqual(outcome.errors, []);
});

test("rejects a web line the saved page doesn't have, so no lyric comes from memory", () => {
  const result = okResult({
    sections: [
      {
        label: "Verso 1",
        lines: [
          ["Tu me chamas sobre as águas", "You call me out upon the waters"],
          ["Onde os meus pés podem falhar", "Where my feet could maybe fail"],
        ],
      },
    ],
  });
  const outcome = checkResult(song(), result, pages({ "sources/oceanos/1.txt": officialPage }));
  assert.deepEqual(outcome.errors, ['English line not found in its saved page: "Where my feet could maybe fail"']);
});

test("rejects a line said to be kept from the file that the file doesn't have", () => {
  const result = okResult({
    sections: [{ label: "Verso 1", lines: [["Tu me chamas sobre o mar", "You call me out upon the waters"]] }],
  });
  const outcome = checkResult(song(), result, pages({ "sources/oceanos/1.txt": officialPage }));
  assert.deepEqual(outcome.errors, ['Português line not found in its file: "Tu me chamas sobre o mar"']);
});

test("rejects a web column whose saved page is missing", () => {
  const outcome = checkResult(song(), okResult(), pages({}));
  assert.deepEqual(outcome.errors, ["English column's saved page is missing: sources/oceanos/1.txt"]);
});

test("rejects lines in a column marked blank", () => {
  const outcome = checkResult(song(), okResult({ en: null }), pages({}));
  assert.deepEqual(outcome.errors, ['English column has lines but no source (set "en")']);
});

test("warns about a file line the result left out", () => {
  const withExtraSlide = song({ slides: [...song().slides, ["E ALI TE ENCONTRO NO MISTÉRIO"]] });
  const outcome = checkResult(withExtraSlide, okResult(), pages({ "sources/oceanos/1.txt": officialPage }));
  assert.deepEqual(outcome.warnings, ['file line left out: "E ALI TE ENCONTRO NO MISTÉRIO"']);
});

test("warns about a line that looks like the other column's language", () => {
  const page = `${officialPage}\nOnde os meus pés podem falhar`;
  const result = okResult({
    sections: [{ label: "Verso 1", lines: [["Tu me chamas sobre as águas", "Onde os meus pés podem falhar"]] }],
  });
  const outcome = checkResult(song(), result, pages({ "sources/oceanos/1.txt": page }));
  assert.ok(outcome.warnings.includes('English column line looks like the other language: "Onde os meus pés podem falhar"'));
});

test("refuses a web column without its saved page", () => {
  const parsed = auditResultSchema.safeParse({
    status: "ok",
    original: { title: "Oceans", artist: "Hillsong UNITED", language: "en" },
    artist: "Hillsong UNITED",
    pt: { origin: "web", title: "Oceanos" },
    en: null,
    sections: [{ label: "Verso 1", lines: [["Tu me chamas", ""]] }],
  });
  assert.equal(parsed.success, false);
});

test("merges an English-only and a Português-only file of the same song, keeping the bilingual one", () => {
  const english = { song: song({ id: "oceans", fileName: "Oceans.pro" }), result: okResult({ pt: { origin: "web", title: "Oceanos", source: "sources/oceans/1.txt" } }) };
  const portuguese = { song: song({ id: "oceanos" }), result: okResult({ en: null }) };
  // Same file name only once both are named "Oceanos - …": give the Português-only one the English title too.
  const portugueseNamed = { ...portuguese, result: { ...portuguese.result, en: { origin: "file" as const, title: "Oceans (Where Feet May Fail)" } } };
  const other = { song: song({ id: "e-ele", fileName: "É Ele.pro" }), result: okResult({ pt: { origin: "file", title: "É Ele" }, en: null }) };

  const groups = planMergeGroups([portugueseNamed, english, other]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].fileName, "Oceanos - Oceans (Where Feet May Fail).pro");
  assert.deepEqual(groups[0].members.map((member) => member.song.id), ["oceanos", "oceans"]);
  assert.equal(groups[0].primary.song.id, "oceanos");
});

test("keeps the fullest song when merging, so the repeats as sung survive", () => {
  const short = { song: song({ id: "a-short" }), result: okResult() };
  const fullSections = [...okResult().sections, { label: "Refrão", lines: [["Tu me chamas sobre as águas", "You call me out upon the waters"]] }];
  const full = { song: song({ id: "b-full", fileName: "Oceans.pro" }), result: okResult({ sections: fullSections }) };

  const [group] = planMergeGroups([short, full]);

  assert.equal(group.primary.song.id, "b-full");
});

test("never merges files from different libraries", () => {
  const louvor = { song: song(), result: okResult() };
  const kids = { song: song({ id: "oceanos-2", library: "Kids", libraryPath: "/libs/Kids" }), result: okResult() };
  assert.equal(planMergeGroups([louvor, kids]).length, 2);
});

test("lists files of the same song that won't merge, for a person to settle together", () => {
  const ready = { song: song(), result: okResult() };
  const followUp = {
    song: song({ id: "oceans", fileName: "Oceans.pro" }),
    result: auditResultSchema.parse({
      status: "followup",
      original: { title: "Oceans", artist: "Hillsong United", language: "en" },
      reason: "versions-differ",
      details: "Two Português recordings differ.",
    }),
  };
  const unidentified = {
    song: song({ id: "teste", fileName: "Teste.pro" }),
    result: auditResultSchema.parse({ status: "followup", reason: "not-found", details: "Nothing found." }),
  };

  const groups = unmergedDuplicates([ready, followUp, unidentified]);

  assert.deepEqual(groups.map((group) => group.map((entry) => entry.song.id)), [["oceanos", "oceans"]]);
});

test("leaves out files of the same song that already merge into one", () => {
  const first = { song: song(), result: okResult() };
  const second = { song: song({ id: "oceanos-2", fileName: "Oceanos 2.pro" }), result: okResult() };
  assert.deepEqual(unmergedDuplicates([first, second]), []);
});

test("makes readable, unique ids from file names", () => {
  const taken = new Set<string>();
  assert.equal(songIdFor("É Ele.pro", taken), "e-ele");
  assert.equal(songIdFor("e ele.pro", taken), "e-ele-2");
  assert.equal(songIdFor("Louvor Oceans (ao vivo).pro", taken), "louvor-oceans-ao-vivo");
});
