import { test } from "node:test";
import assert from "node:assert/strict";
import { slideLines } from "./slideText.ts";

const rows = [
  { id: "1", a: "Ele é fiel", b: "He is faithful", sectionBreakBefore: true },
  { id: "2", a: "Não temerei", b: "I will not fear", sectionBreakBefore: false },
];

test("uppercases the Portuguese lines, accents included", () => {
  assert.deepEqual(slideLines(rows, "a"), ["ELE É FIEL", "NÃO TEMEREI"]);
});

test("uppercases the English lines", () => {
  assert.deepEqual(slideLines(rows, "b"), ["HE IS FAITHFUL", "I WILL NOT FEAR"]);
});

test("keeps an empty line empty so row alignment between the two boxes is preserved", () => {
  assert.deepEqual(slideLines([{ id: "1", a: "Só", b: "", sectionBreakBefore: false }], "b"), [""]);
});
