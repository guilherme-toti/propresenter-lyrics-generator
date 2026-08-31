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

export function proFileName(song: Song): string {
  const safe = (song.title || "Música sem título").replace(/[\\/:*?"<>|]/g, "").trim() || "Música sem título";
  return `${safe}.pro`;
}
