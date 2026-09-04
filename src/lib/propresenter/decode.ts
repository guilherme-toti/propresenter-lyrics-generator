import { getPresentationType } from "./schema";
import { rtfToPlainText } from "./rtfText";

export interface DecodedProFile {
  title: string;
  /** One entry per cue, in document order; each entry is that cue's text
   * lines (already RTF-extracted), across all of that cue's text elements
   * concatenated in element order — matches what one ProPresenter cue shows
   * on one slide. Cues with no text elements at all are omitted. */
  cueLines: string[][];
}

/**
 * The slice of `rv.data.Presentation`'s decoded shape this module actually
 * reads. protobufjs doesn't generate TypeScript types for this vendored
 * schema (the existing encode side — see build.ts — builds plain objects the
 * same way, no generated types either), so this interface exists purely to
 * avoid `any` here, matching how src/lib/lyrics/musixmatch.ts's envelope
 * types handle other loosely-structured external data in this codebase.
 * Every field is optional: protobufjs's toObject() omits anything left at
 * its zero/default value, and a real .pro's exact shape can vary (confirmed
 * by decoding two different real files during this feature's spike).
 */
interface DecodedPresentation {
  name?: string;
  cues?: {
    actions?: {
      slide?: {
        presentation?: {
          baseSlide?: {
            elements?: {
              element?: {
                text?: {
                  rtfData?: Buffer;
                };
              };
            }[];
          };
        };
      };
    }[];
  }[];
}

export async function decodeProFile(buffer: Buffer): Promise<DecodedProFile> {
  const Presentation = await getPresentationType();
  const message = Presentation.decode(buffer);
  const obj = Presentation.toObject(message, { longs: String, bytes: Buffer }) as DecodedPresentation;

  const cueLines: string[][] = [];
  for (const cue of obj.cues ?? []) {
    const elements = cue.actions?.[0]?.slide?.presentation?.baseSlide?.elements ?? [];
    const lines: string[] = [];
    for (const el of elements) {
      const rtfBuffer = el.element?.text?.rtfData;
      if (!rtfBuffer) continue;
      const text = rtfToPlainText(rtfBuffer.toString("utf-8"));
      if (text) lines.push(...text.split("\n").filter((line) => line.length > 0));
    }
    if (lines.length > 0) cueLines.push(lines);
  }

  const title = obj.name?.trim() ? obj.name.trim() : "Música importada";

  return { title, cueLines };
}
