import fs from "node:fs/promises";
import path from "node:path";
import { numberedFileName } from "@/lib/fileNames";

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes `data` into `folder` as `fileName`, appending " (2)", " (3)", … before
 * the extension if that name is already taken — exports never silently
 * clobber an existing presentation. Returns the final absolute path.
 */
export async function writeUniqueFile(folder: string, fileName: string, data: Buffer): Promise<string> {
  let candidate = fileName;
  for (let attempt = 2; await fileExists(path.join(folder, candidate)); attempt += 1) {
    candidate = numberedFileName(fileName, attempt);
  }

  const fullPath = path.join(folder, candidate);
  await fs.writeFile(fullPath, data);
  return fullPath;
}
