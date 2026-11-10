import path from "node:path";
import { numberedFileName, stripUnsafeFileNameCharacters } from "@/lib/fileNames";
import type { SeparateSlotReply } from "./contracts";
import { BackgroundsError, createBeside, errorCode, withFileLock, type NewFileContents } from "./fileSwap";
import { readMacroMedia } from "./library";
import { looksLikeMp4 } from "./media";
import { revealInFileManager } from "./reveal";
import type { SeparateSlotRequest } from "./requests";
import type { MacroMediaMap } from "./slots";

/**
 * Gives one macro's screen a file of its own. "Separar": when several macros show one file,
 * replacing it changes them all, so the screen gets a copy. "Virar vídeo": an image screen only
 * takes images, so it gets its image as a still video (made in the app's window and sent here).
 * The app can't point a macro at the new file (that lives in ProPresenter's own `Configuration/`,
 * which is never written), so the user does that in ProPresenter, once.
 */

/** The prop a macro shows the file through, and the other macros showing that same prop. */
function propOf(map: MacroMediaMap, macroUuid: string, slotId: string): SeparateSlotReply["prop"] {
  const use = map.propUses.find((candidate) => candidate.macroUuid === macroUuid && candidate.slotIds.includes(slotId));
  if (!use) return null;
  const sharedWith = map.macros
    .filter((macro) => macro.macroUuid !== macroUuid)
    .filter((macro) =>
      map.propUses.some((candidate) => candidate.macroUuid === macro.macroUuid && candidate.propUuid === use.propUuid),
    )
    .map((macro) => macro.macroName);
  return { name: use.propName, sharedWith };
}

function copyFailure(err: unknown): unknown {
  switch (errorCode(err)) {
    case "ENOENT":
      return new BackgroundsError(
        "O arquivo dessa tela não está mais lá. Clique em “Atualizar” e confira a macro no ProPresenter.",
        409,
      );
    case "EACCES":
    case "EPERM":
      return new BackgroundsError("O computador não deixou criar a cópia nessa pasta.", 409);
    case "ENOSPC":
      return new BackgroundsError("Falta espaço no disco pra fazer a cópia.", 409);
    default:
      return err;
  }
}

export async function separateSlotFile(
  { folder, slotId, macroUuid, role }: Omit<SeparateSlotRequest, "video">,
  video?: Buffer,
): Promise<SeparateSlotReply> {
  const map = await readMacroMedia(folder);
  const slot = map.slots.find((candidate) => candidate.id === slotId);
  const macro = map.macros.find((candidate) => candidate.macroUuid === macroUuid);
  if (!slot || !macro || !(role === "background" ? macro.backgrounds : macro.props).includes(slotId)) {
    throw new BackgroundsError("Essa tela mudou no ProPresenter. Clique em “Atualizar” e tente de novo.", 404);
  }

  let contents: NewFileContents = { copyOf: slot.filePath };
  if (video) {
    if (slot.mediaType !== "image") throw new BackgroundsError("Essa tela já é um vídeo.", 409);
    if (!looksLikeMp4(video)) {
      throw new BackgroundsError("Não deu pra transformar essa imagem em vídeo. Tente de novo.", 400);
    }
    contents = { bytes: video };
  }

  // "06 - LATERAL.png" becomes "06 - LATERAL - WELCOME.png" (".mp4" as a video): still found next
  // to the original, and says which macro it's for.
  const ext = path.extname(slot.fileName);
  const base = slot.fileName.slice(0, slot.fileName.length - ext.length);
  const name = `${base} - ${stripUnsafeFileNameCharacters(macro.macroName) || "cópia"}${video ? ".mp4" : ext}`;

  let fileName: string;
  try {
    // Locked like a replace, so the copy is never taken halfway through one.
    fileName = await withFileLock(slotId, () =>
      createBeside(path.dirname(slot.filePath), (attempt) => numberedFileName(name, attempt), contents),
    );
  } catch (err) {
    throw copyFailure(err);
  }

  return {
    fileName,
    revealedIn: await revealInFileManager(path.join(path.dirname(slot.filePath), fileName)),
    prop: role === "prop" ? propOf(map, macroUuid, slotId) : null,
  };
}
