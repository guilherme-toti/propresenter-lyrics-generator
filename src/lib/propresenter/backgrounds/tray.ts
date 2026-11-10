import fs from "node:fs/promises";
import path from "node:path";
import type { AddTrayFilesReply, TrayFile, TrayRefusal } from "./contracts";
import { acceptedMediaType, extensionOf } from "./media";
import { rememberFile } from "./trayRegistry";

export type { TrayFile, TrayRefusal };

/** Files dropped on the Backgrounds screen's tray, waiting to be dragged onto a screen. */

export async function addTrayFiles(paths: string[]): Promise<AddTrayFilesReply> {
  const files: TrayFile[] = [];
  const refused: TrayRefusal[] = [];
  for (const rawPath of paths) {
    const filePath = path.resolve(rawPath);
    const fileName = path.basename(filePath).normalize("NFC");
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat?.isDirectory()) {
      refused.push({ fileName, message: "É uma pasta. Abra a pasta e solte os arquivos que estão nela." });
      continue;
    }
    const mediaType = acceptedMediaType(extensionOf(fileName));
    if (!mediaType) {
      refused.push({ fileName, message: "Só dá pra usar imagens (PNG, JPG, WebP) e vídeos MP4." });
      continue;
    }
    if (!stat?.isFile()) {
      refused.push({ fileName, message: "Não achamos esse arquivo. Confira se ele ainda está lá." });
      continue;
    }
    files.push({ id: rememberFile({ filePath, fileName }), fileName, mediaType, sourcePath: filePath });
  }
  return { files, refused };
}
