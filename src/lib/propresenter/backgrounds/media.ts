/**
 * Which files can take a slot's place, and how. No imports on purpose: the Backgrounds screen
 * reads the accepted extensions for its file picker, and `node --test` loads this file directly.
 */

export type MediaType = "image" | "video";

/** Images sharp's prebuilt binaries can read. HEIC is missing because those binaries can't
 * decode it. */
export const ACCEPTED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "tif", "tiff"] as const;
/** MP4 only: a video is never converted, so a slot's container has to match as-is. An image going
 * onto a video slot does become a video, and that one is always MP4 too. */
export const ACCEPTED_VIDEO_EXTENSIONS = ["mp4"] as const;

export type ImageFormat = "png" | "jpeg" | "webp" | "gif" | "tiff";

/** Extensions that name the same encoding (".jpg" and ".jpeg") map to one format, so swapping
 * between them is a plain copy rather than a pointless re-encode. */
const IMAGE_FORMAT_BY_EXTENSION: Record<string, ImageFormat> = {
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  jpe: "jpeg",
  webp: "webp",
  gif: "gif",
  tif: "tiff",
  tiff: "tiff",
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
};

/** Lower-case, without the dot; "" when the name has none. Takes a file name, not a path, so it
 * behaves the same for Windows and POSIX paths. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot <= 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** Whether bytes start like an MP4 (an ISO media file: a "ftyp" box first). The still videos the
 * app's window sends are checked with this before anything is written. */
export function looksLikeMp4(bytes: Uint8Array): boolean {
  return bytes.length > 12 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp";
}

/** Null for anything that isn't a known image or video, which the preview then refuses to serve. */
export function contentTypeFor(fileName: string): string | null {
  return CONTENT_TYPE_BY_EXTENSION[extensionOf(fileName)] ?? null;
}

/** Whether a file with this extension can go on a screen at all, and as what. */
export function acceptedMediaType(extension: string): MediaType | null {
  if ((ACCEPTED_IMAGE_EXTENSIONS as readonly string[]).includes(extension)) return "image";
  if ((ACCEPTED_VIDEO_EXTENSIONS as readonly string[]).includes(extension)) return "video";
  return null;
}

export type RefuseReason = "unsupported-source" | "media-mismatch" | "video-format" | "image-format";

export type ReplacePlan =
  | { action: "copy" }
  | { action: "convert"; format: ImageFormat }
  /** An image onto a video slot: it becomes a still video first, in the app's window (the server
   * has no video encoder). */
  | { action: "encode-video" }
  | { action: "refuse"; reason: RefuseReason; message: string };

const IMAGE_HINT = "uma imagem (PNG, JPG ou WebP)";

/** Why a video slot can't take any file, or null when it can: the app only ever writes MP4. */
function unsupportedVideoSlot(slotExtension: string): string | null {
  if (slotExtension === "mp4") return null;
  const format = slotExtension.toUpperCase() || "de um formato desconhecido";
  return `Este vídeo é ${format}, e por enquanto o app só troca vídeos MP4.`;
}

/**
 * Decides how `sourceFileName` can replace the slot's file without changing the slot's path or
 * name: that path is what the macro points to, so it is the one thing that must stay put.
 */
export function planReplacement(
  slot: { mediaType: MediaType; fileName: string },
  sourceFileName: string,
): ReplacePlan {
  const sourceExtension = extensionOf(sourceFileName);
  const slotExtension = extensionOf(slot.fileName);
  const sourceType = acceptedMediaType(sourceExtension);

  if (!sourceType) {
    return {
      action: "refuse",
      reason: "unsupported-source",
      message: `Esse tipo de arquivo não serve aqui. Use ${slot.mediaType === "video" ? `um vídeo MP4 ou ${IMAGE_HINT}` : IMAGE_HINT}.`,
    };
  }

  if (sourceType === "image" && slot.mediaType === "video") {
    const unsupported = unsupportedVideoSlot(slotExtension);
    return unsupported ? { action: "refuse", reason: "video-format", message: unsupported } : { action: "encode-video" };
  }

  if (sourceType === "video" && slot.mediaType === "image") {
    return {
      action: "refuse",
      reason: "media-mismatch",
      // The macro remembers it shows an image, so a video can only come once it's set up as one.
      message: "Aqui vai uma imagem. Pra pôr vídeos nesta tela, use “Virar vídeo” embaixo dela.",
    };
  }

  if (sourceType === "video") {
    const unsupported = unsupportedVideoSlot(slotExtension);
    if (unsupported) return { action: "refuse", reason: "video-format", message: unsupported };
    return { action: "copy" };
  }

  const slotFormat = IMAGE_FORMAT_BY_EXTENSION[slotExtension];
  if (!slotFormat) {
    return {
      action: "refuse",
      reason: "image-format",
      message: `Esta imagem é ${slotExtension.toUpperCase() || "de um formato desconhecido"}, e o app ainda não sabe criar esse formato.`,
    };
  }
  return IMAGE_FORMAT_BY_EXTENSION[sourceExtension] === slotFormat
    ? { action: "copy" }
    : { action: "convert", format: slotFormat };
}
