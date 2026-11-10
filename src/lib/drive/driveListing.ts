/** Turning a Drive folder's raw listing into what the Drive browser shows. Nothing imported but
 * types, so `node --test` can load it. */

import type { DriveEntry } from "./contracts";

export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const SHORTCUT_MIME_TYPE = "application/vnd.google-apps.shortcut";

/** The fields of a files.list item this app asks for (see googleDrive.ts). */
export interface DriveApiFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  /** Bytes, as a decimal string; missing for folders and Google Docs. */
  size?: string;
  resourceKey?: string;
  /** Short-lived (hours), so it's only used right after the listing. */
  thumbnailLink?: string;
  shortcutDetails?: { targetId: string; targetMimeType?: string; targetResourceKey?: string };
}

/** Wide enough for a tile at twice the screen's density. */
const THUMBNAIL_PX = 480;

/** Drive's thumbnail links come at 220px, sized by a "=s220" ending or an "sz=s220" parameter;
 * asking for more is just a matter of changing the number. A link in another form is kept as is. */
export function sizedThumbnail(link: string, px: number): string {
  if (/=s\d+$/.test(link)) return link.replace(/=s\d+$/, `=s${px}`);
  if (/[?&]sz=s\d+/.test(link)) return link.replace(/([?&]sz=)s\d+/, `$1s${px}`);
  return link;
}

/**
 * Folders first, then files, each newest first: the week's folder or files are usually the last
 * ones added. A shortcut stands in for what it points at, under the shortcut's own name.
 * `mediaTypeOf` decides which files the tray can take, the same way a dropped file is judged.
 */
export function toDriveEntries(
  files: DriveApiFile[],
  mediaTypeOf: (fileName: string) => DriveEntry["mediaType"],
): DriveEntry[] {
  const entries = files.map((file): DriveEntry => {
    const target = file.mimeType === SHORTCUT_MIME_TYPE ? file.shortcutDetails : undefined;
    const kind = (target?.targetMimeType ?? file.mimeType) === FOLDER_MIME_TYPE ? "folder" : "file";
    return {
      id: target?.targetId ?? file.id,
      resourceKey: (target ? target.targetResourceKey : file.resourceKey) ?? null,
      name: file.name,
      kind,
      modifiedTime: file.modifiedTime ?? null,
      // A shortcut's own size isn't its target's; unknown beats wrong.
      size: !target && file.size ? Number(file.size) : null,
      mediaType: kind === "file" ? mediaTypeOf(file.name) : null,
      thumbnailUrl: kind === "file" && file.thumbnailLink ? sizedThumbnail(file.thumbnailLink, THUMBNAIL_PX) : null,
    };
  });
  // RFC 3339 times in UTC compare correctly as strings.
  return entries.sort((a, b) =>
    a.kind === b.kind ? (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? "") : a.kind === "folder" ? -1 : 1,
  );
}
