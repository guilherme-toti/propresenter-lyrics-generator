import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePort } from "./parsePort.ts";

test("parses a plain valid port", () => {
  assert.equal(parsePort("62830"), 62830);
});

test("accepts surrounding whitespace", () => {
  assert.equal(parsePort(" 62830 "), 62830);
});

test("rejects trailing garbage", () => {
  assert.equal(parsePort("62830x"), null);
});

test("rejects a trailing parenthetical", () => {
  assert.equal(parsePort("62830 (padrão)"), null);
});

test("rejects an empty string", () => {
  assert.equal(parsePort(""), null);
});

test("rejects non-numeric input", () => {
  assert.equal(parsePort("abc"), null);
});

test("rejects zero", () => {
  assert.equal(parsePort("0"), null);
});

test("rejects a negative number", () => {
  assert.equal(parsePort("-5"), null);
});

test("rejects a port above the legal range", () => {
  assert.equal(parsePort("65536"), null);
});

test("accepts the upper boundary of the legal range", () => {
  assert.equal(parsePort("65535"), 65535);
});
