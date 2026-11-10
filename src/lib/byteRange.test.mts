import { test } from "node:test";
import assert from "node:assert/strict";
import { parseByteRange } from "./byteRange.ts";

test("sends the whole file when no range is asked for", () => {
  assert.equal(parseByteRange(null, 100), null);
});

test("reads a closed range", () => {
  assert.deepEqual(parseByteRange("bytes=0-9", 100), { start: 0, end: 9 });
});

test("reads an open-ended range to the last byte", () => {
  assert.deepEqual(parseByteRange("bytes=90-", 100), { start: 90, end: 99 });
});

test("reads a suffix range as the last bytes", () => {
  assert.deepEqual(parseByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=-500", 100), { start: 0, end: 99 });
});

test("clamps an end past the file to its last byte", () => {
  assert.deepEqual(parseByteRange("bytes=50-1000", 100), { start: 50, end: 99 });
});

test("reports ranges that can't be served", () => {
  assert.equal(parseByteRange("bytes=100-", 100), "unsatisfiable");
  assert.equal(parseByteRange("bytes=20-10", 100), "unsatisfiable");
  assert.equal(parseByteRange("bytes=-0", 100), "unsatisfiable");
  assert.equal(parseByteRange("bytes=0-", 0), "unsatisfiable");
});

test("falls back to the whole file for shapes it doesn't serve", () => {
  assert.equal(parseByteRange("bytes=0-1,5-6", 100), null);
  assert.equal(parseByteRange("items=0-1", 100), null);
  assert.equal(parseByteRange("bytes=-", 100), null);
  assert.equal(parseByteRange("bytes=abc-def", 100), null);
});
