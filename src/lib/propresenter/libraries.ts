import fs from "node:fs/promises";
import path from "node:path";

export interface LibraryDir {
  /** Folder name, e.g. "Louvor" — what the user actually recognizes as "the library". */
  name: string;
  path: string;
}

/** A same-named .pro file found in some library by /api/export/check-conflict — see
 * ExportOverwriteModal, which offers to overwrite `path` instead of assuming it's in whichever
 * library is currently configured. */
export interface ExportConflict {
  library: string;
  path: string;
}

/**
 * Enumerates every ProPresenter Library folder — the configured one (see Settings' "Pasta da
 * Library") plus every sibling folder next to it, since ProPresenter itself keeps all of a user's
 * libraries as sibling folders under one shared "Libraries" parent, and this app only ever asks
 * for one of them. Shared by the "Importar do ProPresenter" file list and the export
 * conflict-check flow (see ExportOverwriteModal), both of which need to look across every
 * library, not just the configured one.
 *
 * Falls back to just `libraryFolder` itself if the parent can't be read (permissions, or it turns
 * out this isn't actually a ProPresenter Libraries layout) — callers still get something usable
 * instead of failing outright.
 */
export async function listLibraryDirs(libraryFolder: string): Promise<LibraryDir[]> {
  const librariesParent = path.dirname(libraryFolder);
  try {
    const siblingEntries = await fs.readdir(librariesParent, { withFileTypes: true });
    const dirs = siblingEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, path: path.join(librariesParent, entry.name) }));
    if (dirs.length > 0) return dirs;
  } catch {
    // Fall through to the single-folder fallback below.
  }
  return [{ name: path.basename(libraryFolder), path: libraryFolder }];
}

/** Whether `target` is `base` itself or somewhere inside it — used to make sure a client-supplied
 * overwrite path (see /api/export/propresenter) can never point outside the Libraries tree before
 * it's handed to fs.writeFile. Plain string/relative-path comparison, not symlink-aware — good
 * enough for validating a path this same server just returned a moment earlier via check-conflict. */
export function isPathInside(base: string, target: string): boolean {
  const relative = path.relative(base, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
