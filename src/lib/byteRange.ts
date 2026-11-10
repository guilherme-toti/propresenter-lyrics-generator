/** Inclusive on both ends, as HTTP's Content-Range spells it. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Reads a `Range` request header against a file of `size` bytes. `<video>` relies on it to seek
 * and to fetch just enough for a first-frame preview.
 *
 * Returns null when the whole file should be sent: no header, a unit other than bytes, a
 * malformed value, or several ranges. HTTP lets a server answer any of those with the full body,
 * and nothing here asks for multipart ranges.
 */
export function parseByteRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  if (rawStart === "") {
    const suffixLength = Number(rawEnd);
    if (suffixLength === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
