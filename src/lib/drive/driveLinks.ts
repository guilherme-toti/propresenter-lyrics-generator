/** Reading the Google Drive folder links people paste. Nothing imported but types, so `node --test`
 * can load it. */

import type { DriveRef } from "./contracts";

/** Drive ids are URL-safe base64; anything else is a typo or not a Drive link at all. */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

/**
 * The folder a pasted link points at, or null when it isn't a Drive folder link. Takes the address
 * bar's link (with or without "https://", any "/u/0/" account part), a share link from "Copiar
 * link", the older "open?id=" form, or the bare folder id.
 */
export function parseDriveFolderLink(input: string): DriveRef | null {
  const text = input.trim();
  if (DRIVE_ID.test(text)) return { id: text, resourceKey: null };

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.hostname !== "drive.google.com") return null;

  const fromPath = url.pathname.match(/\/folders\/([^/]+)/)?.[1];
  const fromQuery = ["/open", "/folderview"].includes(url.pathname) ? url.searchParams.get("id") : null;
  const id = fromPath ?? fromQuery;
  if (!id || !DRIVE_ID.test(id)) return null;

  const resourceKey = url.searchParams.get("resourcekey");
  return { id, resourceKey: resourceKey && DRIVE_ID.test(resourceKey) ? resourceKey : null };
}

/** The folder's link without anything pasted around it, which is what gets saved. */
export function driveFolderUrl(ref: DriveRef): string {
  const base = `https://drive.google.com/drive/folders/${ref.id}`;
  return ref.resourceKey ? `${base}?resourcekey=${ref.resourceKey}` : base;
}

export const NOT_A_FOLDER_LINK = "Esse não parece um link de pasta do Google Drive.";
