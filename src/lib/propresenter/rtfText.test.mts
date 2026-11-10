import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLyricsRtf } from "./rtf.ts";
import { rtfToLines, rtfToPlainText } from "./rtfText.ts";

const STYLE = { fontFamily: "Arial", fontSizePt: 54, color: { r: 214, g: 214, b: 214 }, alignment: "center" } as const;

/** A language box as build.ts writes it, with a blank row the other language fills. */
const rtf = buildLyricsRtf(["", "I WILL CALL UPON YOUR NAME", "{ÉS} \\ MEU"], STYLE, 1728).toString("utf-8");

test("reads one line per paragraph, keeping a blank one where the export left it", () => {
  assert.deepEqual(rtfToLines(rtf), ["", "I WILL CALL UPON YOUR NAME", "{ÉS} \\ MEU"]);
});

test("reads a box with no text as a single blank line", () => {
  assert.deepEqual(rtfToLines(buildLyricsRtf([], STYLE, 1728).toString("utf-8")), [""]);
});

test("plain text still drops blank paragraphs", () => {
  assert.equal(rtfToPlainText(rtf), "I WILL CALL UPON YOUR NAME\n{ÉS} \\ MEU");
});
