import { test } from "node:test";
import assert from "node:assert/strict";
import { formatModified, formatSize } from "./driveFormat.ts";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

test("says how recent a file is, then its date once it's old", () => {
  assert.equal(formatModified(ago(20_000), NOW), "agora");
  assert.equal(formatModified(ago(5 * 60_000), NOW), "há 5 minutos");
  assert.equal(formatModified(ago(3 * 3_600_000), NOW), "há 3 horas");
  assert.equal(formatModified(ago(30 * 3_600_000), NOW), "ontem");
  assert.equal(formatModified(ago(4 * 86_400_000), NOW), "há 4 dias");
  assert.equal(formatModified("2026-06-02T09:00:00.000Z", NOW), "2 de jun. de 2026");
});

test("says nothing for a time it can't read", () => {
  assert.equal(formatModified("not a date", NOW), "");
});

test("words sizes the way a file manager does", () => {
  assert.equal(formatSize(850 * 1024), "850 KB");
  assert.equal(formatSize(12.4 * 1024 * 1024), "12,4 MB");
  assert.equal(formatSize(1.25 * 1024 ** 3), "1,3 GB");
  assert.equal(formatSize(10), "0,1 KB");
});
