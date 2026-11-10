import { getJsonAs, postJson, postJsonAs } from "@/lib/postJson";
import {
  addTrayFilesReplySchema,
  backgroundsOverviewSchema,
  detectedFolderReplySchema,
  slotChangeReplySchema,
  type AddTrayFilesReply,
  type BackgroundsOverview,
  type MediaSlot,
} from "@/lib/propresenter/backgrounds/contracts";
import type {
  AddTrayFilesRequest,
  ClearScreenRequest,
  FolderRequest,
  RedoSlotRequest,
  ReplaceSlotRequest,
  TriggerMacroRequest,
  UndoSlotRequest,
} from "@/lib/propresenter/backgrounds/requests";

/** The Backgrounds screen's only way to the /api/backgrounds routes. */

/** The workspace ProPresenter lists as its own, or null when none is found. Never throws: not
 * finding it just leaves the setting for the user to fill. */
export async function detectProPresenterFolder(): Promise<string | null> {
  try {
    return (await getJsonAs("/api/backgrounds/workspace", detectedFolderReplySchema)).folder;
  } catch {
    return null;
  }
}

/** Null when the folder is a ProPresenter workspace, otherwise the message to show. */
export async function checkProPresenterFolder(request: FolderRequest): Promise<string | null> {
  const data = await postJson("/api/backgrounds/workspace", request);
  if (data.ok === true) return null;
  return typeof data.error === "string" ? data.error : "Não deu pra conferir essa pasta.";
}

export function readBackgroundsOverview(request: FolderRequest): Promise<BackgroundsOverview> {
  return postJsonAs("/api/backgrounds/list", request, backgroundsOverviewSchema);
}

export function addTrayFiles(request: AddTrayFilesRequest): Promise<AddTrayFilesReply> {
  return postJsonAs("/api/backgrounds/tray", request, addTrayFilesReplySchema);
}

/** Replace, undo and redo all answer with the slot as it is now, so its screen can show the new
 * file and whether "Desfazer" and "Refazer" still have something to put back. */
async function postSlotChange(url: string, body: unknown): Promise<MediaSlot> {
  return (await postJsonAs(url, body, slotChangeReplySchema)).slot;
}

export function replaceBackgroundSlot(request: ReplaceSlotRequest): Promise<MediaSlot> {
  return postSlotChange("/api/backgrounds/replace", request);
}

export function undoBackgroundSlot(request: UndoSlotRequest): Promise<MediaSlot> {
  return postSlotChange("/api/backgrounds/undo", request);
}

export function redoBackgroundSlot(request: RedoSlotRequest): Promise<MediaSlot> {
  return postSlotChange("/api/backgrounds/redo", request);
}

/** /trigger and /clear answer 200 with `ok: false` when ProPresenter can't be reached. */
async function postProPresenterAction(url: string, body: unknown): Promise<void> {
  const data = await postJson(url, body);
  if (data.ok !== true) throw new Error(typeof data.error === "string" ? data.error : "Algo deu errado.");
}

export function triggerMacro(request: TriggerMacroRequest): Promise<void> {
  return postProPresenterAction("/api/backgrounds/trigger", request);
}

export function clearScreen(request: ClearScreenRequest): Promise<void> {
  return postProPresenterAction("/api/backgrounds/clear", request);
}

/** `v` changes whenever the file does, so a replaced file never shows a cached frame. */
export function slotPreviewUrl(folder: string, slot: MediaSlot): string {
  const params = new URLSearchParams({ folder, slot: slot.id, v: String(slot.mtimeMs ?? 0) });
  return `/api/backgrounds/preview?${params.toString()}`;
}

export function trayPreviewUrl(trayFileId: string): string {
  return `/api/backgrounds/tray/preview?${new URLSearchParams({ id: trayFileId }).toString()}`;
}
