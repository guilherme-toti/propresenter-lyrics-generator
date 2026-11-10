import { BufferTarget, Mp4OutputFormat, Output, VideoSample, VideoSampleSource } from "mediabunny";
import { evenSize, fitsVideoLevel, rgbaToI420 } from "./stillVideoFrames";

/**
 * Turns an image into a still MP4, in the app's window: WebCodecs encodes H.264 there (VideoToolbox
 * on macOS), while the Node server has no encoder at all. Checked on ProPresenter 21.4 with a
 * looping macro: same colours as the image, and no flash at the loop.
 */

/** One frame shown this long. More frames of the same picture aren't the same picture once encoded:
 * Chromium's encoder starts soft and sharpens over the next frames, so the screen would shift every
 * time the loop came back to the start. Any length loops the same; ProPresenter re-reads it from
 * the file within seconds of the swap. */
const SECONDS = 10;
/** High profile, level 5.1: up to 4096×2304 (see fitsVideoLevel). */
const CODEC = "avc1.640033";
/** A ceiling, not what's spent: the one frame takes what it needs (about 0.5 MB for 2304×1152).
 * High enough that it's as sharp as the hardware encoder gets. */
const BITRATE = 50_000_000;
/** Must match rgbaToI420's output: full range, BT.709. */
const COLOR_SPACE: VideoColorSpaceInit = { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: true };

const FAILED_MESSAGE = "Não deu pra transformar essa imagem em vídeo. Salve ela como PNG ou JPG e tente de novo.";

/** The image's pixels at its own size (minus an odd last row or column). */
async function readPixels(imageUrl: string): Promise<{ i420: Uint8ClampedArray; width: number; height: number }> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Não achamos essa imagem. Confira se ela ainda está lá.");
  // Fails for a format the window can't decode (TIFF on Windows, for one).
  const bitmap = await createImageBitmap(await response.blob()).catch(() => {
    throw new Error(FAILED_MESSAGE);
  });
  const { width, height } = evenSize(bitmap.width, bitmap.height);
  try {
    if (!fitsVideoLevel(width, height)) {
      throw new Error("Essa imagem é grande demais pra virar vídeo. Use uma de até 4096 × 2304.");
    }
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error(FAILED_MESSAGE);
    // At (0, 0) and unscaled: the video keeps the image's exact size.
    context.drawImage(bitmap, 0, 0);
    return { i420: rgbaToI420(context.getImageData(0, 0, width, height).data, width, height), width, height };
  } finally {
    bitmap.close();
  }
}

export async function encodeStillVideo(imageUrl: string): Promise<Uint8Array> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("Este computador não consegue transformar imagens em vídeo pelo app.");
  }
  const { i420, width, height } = await readPixels(imageUrl);

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const source = new VideoSampleSource({
    codec: "avc",
    fullCodecString: CODEC,
    bitrate: BITRATE,
    latencyMode: "quality",
  });
  output.addVideoTrack(source, { frameRate: 1 / SECONDS });

  try {
    await output.start();
    const sample = new VideoSample(i420, {
      format: "I420",
      codedWidth: width,
      codedHeight: height,
      timestamp: 0,
      duration: SECONDS,
      colorSpace: COLOR_SPACE,
    });
    try {
      await source.add(sample);
    } finally {
      sample.close();
    }
    await output.finalize();
  } catch (err) {
    console.error("backgrounds: encoding a still video failed", err);
    await output.cancel().catch(() => undefined);
    throw new Error(FAILED_MESSAGE);
  }
  if (!target.buffer) throw new Error(FAILED_MESSAGE);
  return new Uint8Array(target.buffer);
}
