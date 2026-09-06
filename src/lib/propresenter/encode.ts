import type { Song } from "@/lib/types";
import { buildPresentationObject } from "./build";
import { getPresentationType } from "./schema";

/** Encodes a Song into a ProPresenter 7 `.pro` file buffer. */
export async function encodeSongAsProFile(song: Song): Promise<Buffer> {
  const Presentation = await getPresentationType();
  const plainObject = buildPresentationObject(song);
  const message = Presentation.fromObject(plainObject);
  return Buffer.from(Presentation.encode(message).finish());
}

/** Strips characters the filesystem can't take in a filename. Shared by proFileName() below and
 * the export conflict-check/overwrite flow (see ExportOverwriteModal), which lets the user type
 * an arbitrary name that needs the same treatment before it's checked against or written to disk. */
export function sanitizeFileBaseName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "").trim() || "Música sem título";
}

export function proFileName(song: Song): string {
  return `${sanitizeFileBaseName(song.title || "Música sem título")}.pro`;
}
