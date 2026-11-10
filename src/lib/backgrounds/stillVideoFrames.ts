/**
 * The pixel side of turning an image into a still video. Nothing imported, so `node --test` can
 * load it; the encoding itself (WebCodecs) is in stillVideo.ts.
 */

/** BT.709's luma weights: what HD video uses. */
const KR = 0.2126;
const KB = 0.0722;
const KG = 1 - KR - KB;

/** H.264 High at level 5.1 (avc1.640033), the codec the app writes: the largest frame it takes,
 * in 16×16 macroblocks, and the longest side (√(8 × that)). Up to 4096×2304. */
const MAX_FRAME_MACROBLOCKS = 36_864;
const MAX_SIDE_MACROBLOCKS = 543;

/** 4:2:0 video needs even sides, so an odd one loses its last row or column. Nothing else changes:
 * the video keeps the image's own size. */
export function evenSize(width: number, height: number): { width: number; height: number } {
  return { width: width - (width % 2), height: height - (height % 2) };
}

export function fitsVideoLevel(width: number, height: number): boolean {
  const across = Math.ceil(width / 16);
  const down = Math.ceil(height / 16);
  return across * down <= MAX_FRAME_MACROBLOCKS && across <= MAX_SIDE_MACROBLOCKS && down <= MAX_SIDE_MACROBLOCKS;
}

/**
 * RGBA to I420 (full range, BT.709), with each chroma sample the average of its 2×2 block.
 * Full range, not the TV range video usually has: WebKit's encoder marks its videos full range
 * whatever it's asked, so TV-range data under that mark plays with lifted, washed-out blacks.
 * Seen in ffmpeg and on ProPresenter 21.4; with full-range data the colours match the image.
 */
export function rgbaToI420(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const chromaWidth = width / 2;
  const chromaHeight = height / 2;
  const lumaSize = width * height;
  const chromaSize = chromaWidth * chromaHeight;
  // Clamped: saturated blue's chroma works out to 255.5, which a plain byte array would wrap to 0.
  // A clamped one also rounds on assignment.
  const i420 = new Uint8ClampedArray(lumaSize + 2 * chromaSize);

  for (let pixel = 0, offset = 0; pixel < lumaSize; pixel += 1, offset += 4) {
    i420[pixel] = KR * rgba[offset] + KG * rgba[offset + 1] + KB * rgba[offset + 2];
  }

  for (let row = 0; row < chromaHeight; row += 1) {
    for (let column = 0; column < chromaWidth; column += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const offset = ((row * 2 + dy) * width + column * 2 + dx) * 4;
        red += rgba[offset];
        green += rgba[offset + 1];
        blue += rgba[offset + 2];
      }
      red /= 4;
      green /= 4;
      blue /= 4;
      const luma = KR * red + KG * green + KB * blue;
      const index = row * chromaWidth + column;
      i420[lumaSize + index] = 128 + (blue - luma) / (2 * (1 - KB));
      i420[lumaSize + chromaSize + index] = 128 + (red - luma) / (2 * (1 - KR));
    }
  }
  return i420;
}

/** The API takes JSON only, so the video travels as base64. Chunked: spreading a whole file into
 * one String.fromCharCode call overflows the call stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}
