import { test } from "node:test";
import assert from "node:assert/strict";
import { findRememberedFile, MAX_REMEMBERED_FILES, rememberFile } from "./trayRegistry.ts";

const file = (name: string) => ({ filePath: `/semana/${name}`, fileName: name });

test("a file brought in again keeps its id", () => {
  const first = rememberFile(file("palavra.png"));
  assert.equal(rememberFile(file("palavra.png")), first);
  assert.deepEqual(findRememberedFile(first), file("palavra.png"));
});

test("forgets the least recently brought-in files first, never one just brought in again", () => {
  const kept = rememberFile(file("inicio.png"));
  const dropped = rememberFile(file("fim.png"));
  for (let i = 0; i < MAX_REMEMBERED_FILES - 2; i += 1) rememberFile(file(`extra-${i}.png`));
  // Re-adding "inicio" makes it the newest, so the next file pushes out "fim" instead.
  rememberFile(file("inicio.png"));
  rememberFile(file("one-more.png"));
  assert.notEqual(findRememberedFile(kept), null);
  assert.equal(findRememberedFile(dropped), null);
});

test("an unknown id finds nothing", () => {
  assert.equal(findRememberedFile("8a1f2c34-1111-4222-8333-444455556666"), null);
});
