import fs from "node:fs/promises";

/**
 * How long an MP4 says it lasts, from its movie header ("mvhd" inside "moov"). Only box headers
 * are read, so a video of any size costs a handful of small reads, wherever "moov" sits. Only Node
 * built-ins, so `node --test` runs it against files it writes.
 */

type FileHandle = Awaited<ReturnType<typeof fs.open>>;

interface BoxBounds {
  /** Where its contents start, past the header. */
  start: number;
  end: number;
}

/** The first box of `type` between `from` and `to`, at that level only. */
async function findBox(file: FileHandle, from: number, to: number, type: string): Promise<BoxBounds | null> {
  const header = Buffer.alloc(16);
  for (let offset = from; offset + 8 <= to; ) {
    const { bytesRead } = await file.read(header, 0, 16, offset);
    if (bytesRead < 8) return null;
    let size = header.readUInt32BE(0);
    let headerSize = 8;
    // 1: the real size follows as 64 bits. 0: the box runs to the end of its parent.
    if (size === 1) {
      if (bytesRead < 16) return null;
      size = Number(header.readBigUInt64BE(8));
      headerSize = 16;
    } else if (size === 0) {
      size = to - offset;
    }
    if (size < headerSize) return null;
    if (header.toString("latin1", 4, 8) === type) return { start: offset + headerSize, end: offset + size };
    offset += size;
  }
  return null;
}

/** Seconds, or null when the file isn't an MP4 this can read. */
export async function mp4DurationSeconds(filePath: string): Promise<number | null> {
  const file = await fs.open(filePath, "r").catch(() => null);
  if (!file) return null;
  try {
    const { size } = await file.stat();
    const moov = await findBox(file, 0, size, "moov");
    const mvhd = moov && (await findBox(file, moov.start, moov.end, "mvhd"));
    if (!mvhd) return null;

    const fields = Buffer.alloc(32);
    const { bytesRead } = await file.read(fields, 0, 32, mvhd.start);
    // Version 1 widens the times and the duration to 64 bits.
    const version = fields[0];
    if (bytesRead < (version === 1 ? 32 : 20)) return null;
    const timescale = version === 1 ? fields.readUInt32BE(20) : fields.readUInt32BE(12);
    const duration = version === 1 ? Number(fields.readBigUInt64BE(24)) : fields.readUInt32BE(16);
    return timescale > 0 ? duration / timescale : null;
  } catch {
    return null;
  } finally {
    await file.close();
  }
}

/** The file and ProPresenter round a length differently. */
const SAME_LENGTH_SECONDS = 0.5;

/** Whether ProPresenter's length for a video (`storedSeconds`) is already the file's. An unreadable
 * file can't be waited on, so it counts as caught up. */
export function caughtUp(fileSeconds: number | null, storedSeconds: number): boolean {
  return fileSeconds === null || Math.abs(fileSeconds - storedSeconds) <= SAME_LENGTH_SECONDS;
}
