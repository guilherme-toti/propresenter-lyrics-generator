import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileStream } from "./fileStream.ts";

async function bigFile(): Promise<{ filePath: string; bytes: Buffer }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pma-stream-"));
  const bytes = Buffer.alloc(2 * 1024 * 1024);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251;
  const filePath = path.join(dir, "fundo.mp4");
  await fs.writeFile(filePath, bytes);
  return { filePath, bytes };
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) parts.push(chunk.value);
  return Buffer.concat(parts);
}

test("streams the whole file, or exactly the requested range", async () => {
  const { filePath, bytes } = await bigFile();
  assert.deepEqual(await readAll(fileStream(filePath)), bytes);
  assert.deepEqual(await readAll(fileStream(filePath, { start: 1000, end: 70_000 })), bytes.subarray(1000, 70_001));
});

test("a reader that cancels after the first chunk leaves no error behind", async () => {
  const { filePath } = await bigFile();
  const uncaught: unknown[] = [];
  const onUncaught = (err: unknown) => uncaught.push(err);
  process.on("uncaughtException", onUncaught);
  try {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reader = fileStream(filePath).getReader();
      await reader.read();
      await reader.cancel();
    }
    // Long enough for a stream that keeps pushing after a cancel to do it.
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    process.off("uncaughtException", onUncaught);
  }
  assert.deepEqual(uncaught, []);
});
