import fs from "node:fs/promises";
import path from "node:path";
import type protobuf from "protobufjs";
import { getAppConfigDir } from "@/lib/desktop/appConfigDir";
import { getMacrosDocumentType, getPropDocumentType } from "@/lib/propresenter/schema";
import { BackgroundsError, hasBackups } from "./fileSwap";
import {
  mapMacroMedia,
  type BackgroundsOverview,
  type DecodedMacrosDocument,
  type DecodedPropDocument,
  type MacroMediaMap,
  type MediaSlot,
  type MediaSlotRef,
} from "./slots";
import { NOT_A_WORKSPACE_MESSAGE, macrosFilePath, propsFilePath } from "./workspace";

/** Where a slot's backups live, in the app's own folder rather than ProPresenter's. */
export function slotBackupDir(slotId: string): string {
  return path.join(getAppConfigDir(), "backgrounds-backups", slotId);
}

/** Where the files "Desfazer" took off a slot wait for "Refazer". */
export function slotRedoDir(slotId: string): string {
  return path.join(getAppConfigDir(), "backgrounds-redo", slotId);
}

function decodeDocument<T>(type: protobuf.Type, buffer: Buffer): T {
  return type.toObject(type.decode(buffer), { longs: String }) as T;
}

/** Size and modified time, or null when the file isn't there. */
async function documentStamp(filePath: string): Promise<string | null> {
  const stat = await fs.stat(filePath).catch(() => null);
  return stat?.isFile() ? `${stat.size}:${stat.mtimeMs}` : null;
}

type MacroMediaCache = Map<string, { stamp: string; map: MacroMediaMap }>;

/** One cache per process (Next can load this module once per route bundle). A seeking <video>
 * sends a preview request per range, and each one resolves its slot against the macros. */
function macroMediaCache(): MacroMediaCache {
  const store = globalThis as typeof globalThis & { __pmaBackgroundsMacroMediaCache?: MacroMediaCache };
  store.__pmaBackgroundsMacroMediaCache ??= new Map();
  return store.__pmaBackgroundsMacroMediaCache;
}

/**
 * Every swappable media file in the workspace, and which macros show it. Resolved against the
 * macros as they are on disk now, not as a client was told earlier: ProPresenter rewrites these
 * documents whenever a macro or prop is edited. Decoding is skipped while neither has changed.
 */
async function readMacroMedia(folder: string): Promise<MacroMediaMap> {
  const [macrosStamp, propsStamp] = await Promise.all([
    documentStamp(macrosFilePath(folder)),
    documentStamp(propsFilePath(folder)),
  ]);
  if (!macrosStamp) throw new BackgroundsError(NOT_A_WORKSPACE_MESSAGE);

  const stamp = `${macrosStamp}|${propsStamp ?? "none"}`;
  const cached = macroMediaCache().get(folder);
  if (cached?.stamp === stamp) return cached.map;

  const macrosBuffer = await fs.readFile(macrosFilePath(folder));
  // A workspace that never had a prop has no Props document at all.
  const propsBuffer = propsStamp ? await fs.readFile(propsFilePath(folder)) : null;
  const macros = decodeDocument<DecodedMacrosDocument>(await getMacrosDocumentType(), macrosBuffer);
  const props = propsBuffer ? decodeDocument<DecodedPropDocument>(await getPropDocumentType(), propsBuffer) : {};

  const map = mapMacroMedia(macros, props, { windows: process.platform === "win32" });
  macroMediaCache().set(folder, { stamp, map });
  return map;
}

export async function findSlotRef(folder: string, slotId: string): Promise<MediaSlotRef | null> {
  return (await readMacroMedia(folder)).slots.find((slot) => slot.id === slotId) ?? null;
}

/** Like findSlotRef, for routes that can't go on without the slot. */
export async function requireSlotRef(folder: string, slotId: string): Promise<MediaSlotRef> {
  const slot = await findSlotRef(folder, slotId);
  if (!slot) {
    throw new BackgroundsError("Esse arquivo não está mais nas macros. Clique em “Atualizar” e tente de novo.", 404);
  }
  return slot;
}

/** Drops `filePath`: the client identifies a slot by id only. */
export async function describeSlot({ filePath, ...slot }: MediaSlotRef): Promise<MediaSlot> {
  const [stat, canUndo, canRedo] = await Promise.all([
    fs.stat(filePath).catch(() => null),
    hasBackups(slotBackupDir(slot.id)),
    hasBackups(slotRedoDir(slot.id)),
  ]);
  const exists = stat?.isFile() ?? false;
  return { ...slot, exists, mtimeMs: exists && stat ? Math.round(stat.mtimeMs) : null, canUndo, canRedo };
}

export async function readBackgroundsOverview(folder: string): Promise<BackgroundsOverview> {
  const { slots, macros } = await readMacroMedia(folder);
  return { slots: await Promise.all(slots.map(describeSlot)), macros };
}
