import { test } from "node:test";
import assert from "node:assert/strict";
import { numberedFileName, stripUnsafeFileNameCharacters } from "./fileNames.ts";

test("strips what a filename can't hold, and the spaces around it", () => {
  assert.equal(stripUnsafeFileNameCharacters(' Palavra: "Bíblia"/Fim? '), "Palavra BíbliaFim");
  assert.equal(stripUnsafeFileNameCharacters("<>|*"), "");
});

test("numbers a taken name before its extension", () => {
  assert.equal(numberedFileName("06 - LATERAL - WELCOME.png", 1), "06 - LATERAL - WELCOME.png");
  assert.equal(numberedFileName("06 - LATERAL - WELCOME.png", 2), "06 - LATERAL - WELCOME (2).png");
  assert.equal(numberedFileName("É Ele.pro", 3), "É Ele (3).pro");
  assert.equal(numberedFileName("sem extensão", 2), "sem extensão (2)");
  assert.equal(numberedFileName(".oculto", 2), ".oculto (2)");
});
