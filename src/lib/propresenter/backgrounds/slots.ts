import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BackgroundsOverview, MacroMedia, MediaSlot } from "./contracts";
import type { MediaType } from "./media";

export type { BackgroundsOverview, MacroMedia, MediaSlot };

/**
 * Maps decoded `Configuration/Macros` and `Configuration/Props` documents to the media files the
 * Backgrounds screen can swap. Pure on purpose (no file I/O, no local runtime imports), so
 * `node --test` can load it and cover the mapping without a real workspace.
 */

/** Server-side only: `filePath` is exactly what a client must not be able to choose, so it never
 * leaves the server. */
export interface MediaSlotRef extends Omit<MediaSlot, "exists" | "mtimeMs" | "canUndo" | "canRedo"> {
  filePath: string;
}

/**
 * The slice of protobufjs's `toObject()` output this module reads. protobufjs doesn't generate
 * TypeScript types for the vendored schema, so these stay hand-written (see decode.ts). Every
 * field is optional because `toObject()` omits anything left at its default.
 */
interface DecodedUuid {
  string?: string;
}

/** Components run 0–1; toObject() leaves out any that are 0. */
interface DecodedColor {
  red?: number;
  green?: number;
  blue?: number;
}

interface DecodedMedia {
  url?: { absoluteString?: string };
  image?: object;
  /** In seconds: `endPoint` is how long ProPresenter believes the file is, `outPoint` where it stops
   * (earlier when the video was trimmed there). Both are re-read a few seconds after the file
   * changes; until then a longer video still stops at the old end. */
  video?: { transport?: { outPoint?: number; endPoint?: number } };
}

export interface DecodedMacrosDocument {
  macros?: {
    uuid?: DecodedUuid;
    name?: string;
    color?: DecodedColor;
    actions?: {
      media?: { element?: DecodedMedia };
      prop?: { identification?: { parameterUuid?: DecodedUuid; parameterName?: string } };
    }[];
  }[];
}

export interface DecodedPropDocument {
  cues?: {
    uuid?: DecodedUuid;
    name?: string;
    actions?: {
      slide?: { prop?: { baseSlide?: { elements?: { element?: { fill?: { media?: DecodedMedia } } }[] } } };
    }[];
  }[];
}

export interface MapMacroMediaOptions {
  /** Whether the URLs were written on Windows (`file:///C:/…`). The server passes its own
   * platform; tests pass both. */
  windows: boolean;
}

function mediaTypeOf(media: DecodedMedia): MediaType | null {
  if (media.video) return "video";
  if (media.image) return "image";
  return null;
}

/** ProPresenter writes uppercase UUIDs, but nothing promises it. */
function normalizeUuid(uuid: string | undefined): string | null {
  const trimmed = uuid?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function toFilePath(url: string | undefined, windows: boolean): string | null {
  if (!url?.startsWith("file:")) return null;
  try {
    return fileURLToPath(url, { windows });
  } catch {
    return null;
  }
}

/** Two macros can spell the same file differently: decomposed vs. composed accents on macOS, or
 * different letter case on Windows, whose filesystems ignore it. */
function fileKey(filePath: string, windows: boolean): string {
  const composed = filePath.normalize("NFC");
  return windows ? composed.toLowerCase() : composed;
}

export function slotIdFor(filePath: string, windows: boolean): string {
  return createHash("sha256").update(fileKey(filePath, windows)).digest("hex").slice(0, 16);
}

/** How long ProPresenter believes this video is, or null when it isn't a video or doesn't say. The
 * end, not the out point: a trim the user made stays shorter than the file on purpose. */
function storedLengthOf(media: DecodedMedia): number | null {
  const transport = media.video?.transport;
  const length = transport?.endPoint ?? transport?.outPoint;
  return typeof length === "number" && length > 0 ? length : null;
}

function cssColor(color: DecodedColor | undefined): string | null {
  if (!color) return null;
  const channel = (value: number | undefined) => Math.round(Math.min(Math.max(value ?? 0, 0), 1) * 255);
  return `rgb(${channel(color.red)} ${channel(color.green)} ${channel(color.blue)})`;
}

interface DecodedProp {
  name: string | null;
  media: DecodedMedia[];
}

function propsByUuid(props: DecodedPropDocument): Map<string, DecodedProp> {
  const byUuid = new Map<string, DecodedProp>();
  for (const cue of props.cues ?? []) {
    const uuid = normalizeUuid(cue.uuid?.string);
    if (!uuid) continue;
    const media = (cue.actions ?? []).flatMap((action) =>
      (action.slide?.prop?.baseSlide?.elements ?? []).flatMap((element) => {
        const fillMedia = element.element?.fill?.media;
        return fillMedia ? [fillMedia] : [];
      }),
    );
    byUuid.set(uuid, { name: cue.name?.trim() || null, media });
  }
  return byUuid;
}

/** Server-side only: a prop a macro shows, so "Separar" can say which prop to edit, and whether
 * another macro shows that very prop too (then the macro needs a prop of its own). */
export interface PropUse {
  macroUuid: string;
  propUuid: string;
  /** As ProPresenter lists it; empty when neither the prop nor the macro's action names it. */
  propName: string;
  slotIds: string[];
}

export interface MacroMediaMap {
  /** One per file, ordered by the first macro that shows it. */
  slots: MediaSlotRef[];
  /** In ProPresenter's macro order, leaving out macros that show no file. */
  macros: MacroMedia[];
  /** In macro order, only props that show a file. */
  propUses: PropUse[];
  /** By macro uuid, then slot id: how long ProPresenter believes each of the macro's videos is. */
  videoLengths: Record<string, Record<string, number>>;
}

/**
 * The files referenced by each macro's media and prop actions. A prop action whose prop no longer
 * exists is skipped rather than failing the whole list.
 */
export function mapMacroMedia(
  macrosDocument: DecodedMacrosDocument,
  props: DecodedPropDocument,
  { windows }: MapMacroMediaOptions,
): MacroMediaMap {
  const pathApi = windows ? path.win32 : path.posix;
  const propsById = propsByUuid(props);
  const slots = new Map<string, MediaSlotRef>();
  const macros: MacroMedia[] = [];
  const propUses: PropUse[] = [];
  const videoLengths: Record<string, Record<string, number>> = {};

  /** The slot id for the file, or null when it isn't an image or video on disk. */
  const slotFor = (media: DecodedMedia): string | null => {
    const mediaType = mediaTypeOf(media);
    const filePath = toFilePath(media.url?.absoluteString, windows);
    if (!mediaType || !filePath) return null;

    const key = fileKey(filePath, windows);
    let slot = slots.get(key);
    if (!slot) {
      slot = {
        id: slotIdFor(filePath, windows),
        fileName: pathApi.basename(filePath).normalize("NFC"),
        mediaType,
        filePath,
      };
      slots.set(key, slot);
    }
    return slot.id;
  };

  for (const macro of macrosDocument.macros ?? []) {
    const macroUuid = normalizeUuid(macro.uuid?.string);
    if (!macroUuid) continue;
    const backgrounds = new Set<string>();
    const macroProps = new Set<string>();
    const lengths: Record<string, number> = {};
    const noteLength = (slotId: string, media: DecodedMedia) => {
      const length = storedLengthOf(media);
      if (length !== null) lengths[slotId] = length;
    };

    for (const action of macro.actions ?? []) {
      if (action.media?.element) {
        const slotId = slotFor(action.media.element);
        if (slotId) {
          backgrounds.add(slotId);
          noteLength(slotId, action.media.element);
        }
        continue;
      }
      const identification = action.prop?.identification;
      const propUuid = normalizeUuid(identification?.parameterUuid?.string);
      const prop = propUuid ? propsById.get(propUuid) : undefined;
      if (!propUuid || !prop) continue;
      const slotIds = [...new Set(prop.media.flatMap((media) => slotFor(media) ?? []))];
      if (slotIds.length === 0) continue;
      for (const media of prop.media) {
        const slotId = slotFor(media);
        if (slotId) noteLength(slotId, media);
      }
      for (const slotId of slotIds) macroProps.add(slotId);
      propUses.push({ macroUuid, propUuid, propName: prop.name ?? identification?.parameterName?.trim() ?? "", slotIds });
    }

    if (backgrounds.size === 0 && macroProps.size === 0) continue;
    macros.push({
      macroUuid,
      macroName: macro.name?.trim() || "Macro sem nome",
      macroColor: cssColor(macro.color),
      backgrounds: [...backgrounds],
      props: [...macroProps],
    });
    if (Object.keys(lengths).length > 0) videoLengths[macroUuid] = lengths;
  }

  return { slots: [...slots.values()], macros, propUses, videoLengths };
}
