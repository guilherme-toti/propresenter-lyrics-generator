import { randomUUID } from "node:crypto";

/**
 * The ids tray files are previewed by. The page can only show a local file through this server,
 * and a preview route that took a path would let a request read any image or video on the
 * computer, so each file the user brings in gets a random id here and only ids are ever served.
 * Only Node built-ins are imported, so `node --test` can load it.
 */

export interface RegisteredFile {
  filePath: string;
  fileName: string;
}

/** Plenty for a service's worth of files, and keeps a long session from growing the map forever. */
export const MAX_REMEMBERED_FILES = 200;

type Registry = Map<string, RegisteredFile>;

/** On globalThis because Next can load this module once per route bundle. */
function registry(): Registry {
  const store = globalThis as typeof globalThis & { __pmaBackgroundsTrayRegistry?: Registry };
  store.__pmaBackgroundsTrayRegistry ??= new Map();
  return store.__pmaBackgroundsTrayRegistry;
}

/** The file's id. A file brought in again keeps the id it had, since that's the one the page
 * holds, and counts as the newest so it's the last to be forgotten. */
export function rememberFile(file: RegisteredFile): string {
  const files = registry();
  let id: string | undefined;
  for (const [knownId, known] of files) {
    if (known.filePath === file.filePath) {
      id = knownId;
      break;
    }
  }
  id ??= randomUUID();
  // Maps iterate in insertion order: deleting and setting again moves the file to the end.
  files.delete(id);
  files.set(id, file);
  while (files.size > MAX_REMEMBERED_FILES) {
    const oldest = files.keys().next().value;
    if (oldest === undefined) break;
    files.delete(oldest);
  }
  return id;
}

export function findRememberedFile(id: string): RegisteredFile | null {
  return registry().get(id) ?? null;
}
