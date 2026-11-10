import fs from "node:fs/promises";
import path from "node:path";
import type sharpFn from "sharp";
import {
  BackgroundsError,
  isSameFile,
  redoLatest,
  replaceFile,
  undoLatest,
  withFileLock,
  type SwapTarget,
} from "./fileSwap";
import { describeSlot, requireSlotRef, slotBackupDir, slotRedoDir } from "./library";
import { planReplacement, type ImageFormat } from "./media";
import type { MediaSlot, MediaSlotRef } from "./slots";

/**
 * Swaps a slot's file in place. ProPresenter re-reads a macro's media from its path on the next
 * trigger (checked on ProPresenter 21.4 for images and MP4 videos), and the macro's own settings
 * stay in the macro, so keeping the exact path and name is the whole trick. Nothing under
 * `Configuration/` is ever written. The disk work itself is in fileSwap.ts.
 */

async function convertImage(sourcePath: string, format: ImageFormat): Promise<Buffer> {
  let sharp: typeof sharpFn;
  try {
    sharp = (await import("sharp")).default;
  } catch (err) {
    console.error("backgrounds: sharp failed to load", err);
    throw new BackgroundsError(
      `Não deu pra converter a imagem neste computador. Salve ela como ${format.toUpperCase()} e tente de novo.`,
      500,
    );
  }
  try {
    // rotate() with no angle applies the EXIF orientation, which the target format may not carry.
    return await sharp(sourcePath).rotate().toFormat(format).toBuffer();
  } catch {
    throw new BackgroundsError("Não deu pra ler essa imagem. Tente outro arquivo.");
  }
}

function swapTargetOf(slot: MediaSlotRef): SwapTarget {
  return { targetPath: slot.filePath, backupDir: slotBackupDir(slot.id), redoDir: slotRedoDir(slot.id) };
}

export async function replaceSlotFile(folder: string, slotId: string, sourcePath: string): Promise<MediaSlot> {
  return withFileLock(slotId, async () => {
    const slot = await requireSlotRef(folder, slotId);

    const source = path.resolve(sourcePath);
    const sourceStat = await fs.stat(source).catch(() => null);
    if (!sourceStat?.isFile()) {
      throw new BackgroundsError("Não achamos o arquivo escolhido. Confira se ele ainda está lá.");
    }
    if (await isSameFile(source, slot.filePath)) {
      throw new BackgroundsError("Esse já é o arquivo que a macro usa.");
    }

    const plan = planReplacement(slot, path.basename(source));
    if (plan.action === "refuse") throw new BackgroundsError(plan.message);

    // Converting before anything is backed up or written means an unreadable image changes nothing.
    const converted = plan.action === "convert" ? await convertImage(source, plan.format) : null;
    await replaceFile({
      ...swapTargetOf(slot),
      sourcePath: source,
      write: (targetPath) => (converted ? fs.writeFile(targetPath, converted) : fs.copyFile(source, targetPath)),
    });
    return describeSlot(slot);
  });
}

async function stepSlotHistory(
  folder: string,
  slotId: string,
  step: (target: SwapTarget) => Promise<void>,
): Promise<MediaSlot> {
  return withFileLock(slotId, async () => {
    const slot = await requireSlotRef(folder, slotId);
    await step(swapTargetOf(slot));
    return describeSlot(slot);
  });
}

/** Puts back the file the latest replace on this slot backed up. */
export function undoLastReplace(folder: string, slotId: string): Promise<MediaSlot> {
  return stepSlotHistory(folder, slotId, undoLatest);
}

/** Puts back the file the latest undo on this slot took off. */
export function redoLastUndo(folder: string, slotId: string): Promise<MediaSlot> {
  return stepSlotHistory(folder, slotId, redoLatest);
}
