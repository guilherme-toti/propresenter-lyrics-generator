import { test } from "node:test";
import assert from "node:assert/strict";
import { fileNamesMatch } from "./libraries.ts";

test("matches a macOS NFD filename against a name built in JavaScript", () => {
  // The real bug: "É Ele.pro" read from disk is 10 characters (E + U+0301 combining acute),
  // while the same name built from a song title is 9 (precomposed É). They render identically
  // and are not equal, so a raw === silently reported "no conflict" for every accented title
  // and the export wrote "É Ele (2).pro" instead of offering to overwrite.
  const fromDisk = "É Ele.pro".normalize("NFD");
  const fromTitle = "É Ele.pro".normalize("NFC");

  assert.notEqual(fromDisk, fromTitle);
  assert.equal(fileNamesMatch(fromDisk, fromTitle), true);
});

test("ignores case, matching the case-insensitive filesystems this runs on", () => {
  assert.equal(fileNamesMatch("Abba.pro", "abba.PRO"), true);
});

test("ignores case and normalisation together", () => {
  assert.equal(fileNamesMatch("É ELE.pro".normalize("NFD"), "é ele.pro".normalize("NFC")), true);
});

test("does not match genuinely different names", () => {
  assert.equal(fileNamesMatch("É Ele.pro", "É Ele (2).pro"), false);
});

test("does not match names differing only past the accent", () => {
  assert.equal(fileNamesMatch("Águas.pro".normalize("NFD"), "Agua.pro"), false);
});

test("matches plain ASCII names unchanged", () => {
  assert.equal(fileNamesMatch("teste.pro", "teste.pro"), true);
});
