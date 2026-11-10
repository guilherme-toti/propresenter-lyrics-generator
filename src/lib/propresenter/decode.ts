import { getPresentationType } from "./schema";
import { rtfToLines, rtfToPlainText } from "./rtfText";

/** One text element on a slide. */
export interface DecodedTextBox {
  /** The element's name in ProPresenter, "" when unset. */
  name: string;
  /** One trimmed entry per paragraph, blank ones kept (see rtfToLines). */
  lines: string[];
}

/** The ProPresenter slide group a cue sits in. */
export interface DecodedCueGroup {
  /** The group's position among the file's groups, which tells apart groups that share a name
   * (a chorus sung four times is four "Refrão" groups). */
  index: number;
  /** The group's name, "" when unset. */
  name: string;
}

export interface DecodedProFile {
  title: string;
  /** One entry per cue, in document order; each entry is that cue's text
   * lines (already RTF-extracted), across all of that cue's text elements
   * concatenated in element order — matches what one ProPresenter cue shows
   * on one slide. Cues with no text elements at all are omitted. */
  cueLines: string[][];
  /** The same cues kept apart by text element, so a reader can tell which box
   * a line came from and where the blank lines are. One entry per cue with at
   * least one text element, in document order; elements in element order. */
  cueBoxes: DecodedTextBox[][];
  /** The group each cueBoxes entry sits in, at the same index; null for a cue in no group. */
  cueBoxGroups: (DecodedCueGroup | null)[];
  /** The file's CCLI author and artist, "" when unset. This app's export writes the song's artist
   * as the author (see build.ts); ProPresenter's CCLI panel fills both. */
  author: string;
  artistCredits: string;
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
  ccli?: {
    author?: string;
    artistCredits?: string;
  };
  cueGroups?: {
    group?: { name?: string };
    cueIdentifiers?: { string?: string }[];
  }[];
  cues?: {
    uuid?: { string?: string };
    actions?: {
      slide?: {
        presentation?: {
          baseSlide?: {
            elements?: {
              element?: {
                name?: string;
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

  const groupByCue = new Map<string, DecodedCueGroup>();
  (obj.cueGroups ?? []).forEach((cueGroup, index) => {
    const group = { index, name: cueGroup.group?.name?.trim() ?? "" };
    for (const id of cueGroup.cueIdentifiers ?? []) {
      if (id.string && !groupByCue.has(id.string)) groupByCue.set(id.string, group);
    }
  });

  const cueLines: string[][] = [];
  const cueBoxes: DecodedTextBox[][] = [];
  const cueBoxGroups: (DecodedCueGroup | null)[] = [];
  for (const cue of obj.cues ?? []) {
    const elements = cue.actions?.[0]?.slide?.presentation?.baseSlide?.elements ?? [];
    const lines: string[] = [];
    const boxes: DecodedTextBox[] = [];
    for (const el of elements) {
      const rtfBuffer = el.element?.text?.rtfData;
      if (!rtfBuffer) continue;
      const rtf = rtfBuffer.toString("utf-8");
      const text = rtfToPlainText(rtf);
      if (text) lines.push(...text.split("\n").filter((line) => line.length > 0));
      boxes.push({ name: el.element?.name ?? "", lines: rtfToLines(rtf) });
    }
    if (lines.length > 0) cueLines.push(lines);
    if (boxes.length > 0) {
      cueBoxes.push(boxes);
      cueBoxGroups.push(groupByCue.get(cue.uuid?.string ?? "") ?? null);
    }
  }

  const title = obj.name?.trim() ? obj.name.trim() : "Música importada";

  return {
    title,
    cueLines,
    cueBoxes,
    cueBoxGroups,
    author: obj.ccli?.author?.trim() ?? "",
    artistCredits: obj.ccli?.artistCredits?.trim() ?? "",
  };
}
