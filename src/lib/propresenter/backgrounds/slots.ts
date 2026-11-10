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
  video?: object;
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

function cssColor(color: DecodedColor | undefined): string | null {
  if (!color) return null;
  const channel = (value: number | undefined) => Math.round(Math.min(Math.max(value ?? 0, 0), 1) * 255);
  return `rgb(${channel(color.red)} ${channel(color.green)} ${channel(color.blue)})`;
}

function propMediaByUuid(props: DecodedPropDocument): Map<string, DecodedMedia[]> {
  const byUuid = new Map<string, DecodedMedia[]>();
  for (const cue of props.cues ?? []) {
    const uuid = normalizeUuid(cue.uuid?.string);
    if (!uuid) continue;
    const media = (cue.actions ?? []).flatMap((action) =>
      (action.slide?.prop?.baseSlide?.elements ?? []).flatMap((element) => {
        const fillMedia = element.element?.fill?.media;
        return fillMedia ? [fillMedia] : [];
      }),
    );
    byUuid.set(uuid, media);
  }
  return byUuid;
}

export interface MacroMediaMap {
  /** One per file, ordered by the first macro that shows it. */
  slots: MediaSlotRef[];
  /** In ProPresenter's macro order, leaving out macros that show no file. */
  macros: MacroMedia[];
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
  const propMedia = propMediaByUuid(props);
  const slots = new Map<string, MediaSlotRef>();
  const macros: MacroMedia[] = [];

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
    const add = (target: Set<string>, media: DecodedMedia) => {
      const slotId = slotFor(media);
      if (slotId) target.add(slotId);
    };

    for (const action of macro.actions ?? []) {
      if (action.media?.element) {
        add(backgrounds, action.media.element);
        continue;
      }
      const propUuid = normalizeUuid(action.prop?.identification?.parameterUuid?.string);
      if (!propUuid) continue;
      for (const media of propMedia.get(propUuid) ?? []) add(macroProps, media);
    }

    if (backgrounds.size === 0 && macroProps.size === 0) continue;
    macros.push({
      macroUuid,
      macroName: macro.name?.trim() || "Macro sem nome",
      macroColor: cssColor(macro.color),
      backgrounds: [...backgrounds],
      props: [...macroProps],
    });
  }

  return { slots: [...slots.values()], macros };
}
