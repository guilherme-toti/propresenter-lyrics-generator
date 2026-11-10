import { test } from "node:test";
import assert from "node:assert/strict";
import { withLiteralTranslation } from "./literalTranslation.ts";
import { createEmptySong } from "./types.ts";

const pickedSong = createEmptySong({
  languageA: "Linha um\nLinha dois",
  languageB: "Line one\nLine two",
  sourceA: { commontrackId: 1, title: "Gravação base", artist: "Ministério" },
  attributionA: { copyright: "Letra © Ministério", trackingUrl: "https://tracking.example/a" },
  sourceB: { commontrackId: 2, title: "Picked recording", artist: "Band" },
  attributionB: { copyright: "Lyrics © Band", trackingUrl: "https://tracking.example/b" },
  translatableSide: "languageB",
});

const translated = {
  languageARaw: "Linha um\nLinha dois",
  languageBRaw: "Line one, literally\nLine two, literally",
  alignment: [
    { id: "r1", a: "Linha um", b: "Line one, literally", sectionBreakBefore: false },
    { id: "r2", a: "Linha dois", b: "Line two, literally", sectionBreakBefore: false },
  ],
};

test("a translation that lands replaces the side's text and alignment and labels it as translated", () => {
  const next = withLiteralTranslation(pickedSong, "languageB", translated);

  assert.equal(next.languageB, translated.languageBRaw);
  assert.equal(next.languageA, translated.languageARaw);
  assert.deepEqual(next.alignment, translated.alignment);
  assert.equal(next.literalTranslationB, "done");
});

test("the translated side drops the recording and attribution its old text came from", () => {
  const next = withLiteralTranslation(pickedSong, "languageB", translated);

  assert.equal("sourceB" in next, false);
  assert.equal("attributionB" in next, false);
});

test("the other side keeps its recording, attribution and label", () => {
  const next = withLiteralTranslation(pickedSong, "languageB", translated);

  assert.deepEqual(next.sourceA, pickedSong.sourceA);
  assert.deepEqual(next.attributionA, pickedSong.attributionA);
  assert.equal(next.literalTranslationA, undefined);
  assert.equal(next.translatableSide, "languageB");
});

test("translating Português works the same way on side A", () => {
  const next = withLiteralTranslation(pickedSong, "languageA", translated);

  assert.equal(next.literalTranslationA, "done");
  assert.equal("sourceA" in next, false);
  assert.equal("attributionA" in next, false);
  assert.deepEqual(next.sourceB, pickedSong.sourceB);
});

test("the song it was given is left as it was", () => {
  const snapshot = structuredClone(pickedSong);
  withLiteralTranslation(pickedSong, "languageB", translated);

  assert.deepEqual(pickedSong, snapshot);
});
