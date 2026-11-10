import { test } from "node:test";
import assert from "node:assert/strict";
import { otherMacrosShowing } from "./sharedFiles.ts";

const macro = (macroUuid: string, backgrounds: string[], props: string[]) => ({
  macroUuid,
  macroName: macroUuid.toUpperCase(),
  macroColor: null,
  backgrounds,
  props,
});

const macros = [
  macro("welcome", ["central-welcome"], ["lateral"]),
  macro("ofertorio", ["central-pregacao"], ["lateral"]),
  macro("pregacao", ["central-pregacao"], ["lateral"]),
  macro("encerramento", ["central-bye"], ["lateral-bye"]),
];

test("names the other macros showing the same file, in ProPresenter's order", () => {
  assert.deepEqual(otherMacrosShowing("welcome", "lateral", macros), ["OFERTORIO", "PREGACAO"]);
  assert.deepEqual(otherMacrosShowing("pregacao", "central-pregacao", macros), ["OFERTORIO"]);
});

test("a file only this macro shows has nobody to name", () => {
  assert.deepEqual(otherMacrosShowing("welcome", "central-welcome", macros), []);
  assert.deepEqual(otherMacrosShowing("encerramento", "lateral-bye", macros), []);
});
