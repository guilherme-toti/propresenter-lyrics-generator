import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { caughtUp, mp4DurationSeconds } from "./mp4Duration.ts";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "pma-mp4duration-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function box(type: string, ...contents: Buffer[]): Buffer {
  const body = Buffer.concat(contents);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, body]);
}

/** A box whose size is given in the 64-bit field, as big "mdat" boxes are. */
function largeBox(type: string, contents: Buffer): Buffer {
  const header = Buffer.alloc(16);
  header.writeUInt32BE(1, 0);
  header.write(type, 4, "latin1");
  header.writeBigUInt64BE(BigInt(16 + contents.length), 8);
  return Buffer.concat([header, contents]);
}

function mvhd(version: 0 | 1, timescale: number, duration: number): Buffer {
  if (version === 0) {
    const fields = Buffer.alloc(100);
    fields.writeUInt32BE(timescale, 12);
    fields.writeUInt32BE(duration, 16);
    return box("mvhd", fields);
  }
  const fields = Buffer.alloc(112);
  fields[0] = 1;
  fields.writeUInt32BE(timescale, 20);
  fields.writeBigUInt64BE(BigInt(duration), 24);
  return box("mvhd", fields);
}

async function write(name: string, ...boxes: Buffer[]): Promise<string> {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, Buffer.concat(boxes));
  return filePath;
}

const ftyp = box("ftyp", Buffer.from("isom\0\0\x02\0isomiso2avc1mp41", "latin1"));

test("reads the length from the movie header", async () => {
  const filePath = await write("a.mp4", ftyp, box("moov", mvhd(0, 1000, 20_000), box("trak")));
  assert.equal(await mp4DurationSeconds(filePath), 20);
});

test("finds the header after the media data, and reads 64-bit sizes and times", async () => {
  const filePath = await write(
    "b.mp4",
    ftyp,
    largeBox("mdat", Buffer.alloc(4096)),
    box("moov", box("trak"), mvhd(1, 30_000, 900_900)),
  );
  assert.equal(await mp4DurationSeconds(filePath), 30.03);
});

test("says nothing for a file that isn't an MP4 it can read", async () => {
  assert.equal(await mp4DurationSeconds(await write("c.png", Buffer.from("\x89PNG\r\n\x1a\n not a video", "latin1"))), null);
  assert.equal(await mp4DurationSeconds(await write("d.mp4", ftyp, box("free", Buffer.alloc(16)))), null);
  assert.equal(await mp4DurationSeconds(await write("e.mp4", ftyp, box("moov", mvhd(0, 0, 10)))), null);
  assert.equal(await mp4DurationSeconds(path.join(dir, "missing.mp4")), null);
});

test("ProPresenter has caught up once its length is the file's, give or take rounding", () => {
  assert.equal(caughtUp(30, 30), true);
  assert.equal(caughtUp(14.955, 14.917), true);
});

test("a swapped video of another length isn't caught up yet, longer or shorter", () => {
  assert.equal(caughtUp(30, 14.917), false);
  assert.equal(caughtUp(5, 10), false);
});

test("a file whose length can't be read is never waited on", () => {
  assert.equal(caughtUp(null, 10), true);
});
