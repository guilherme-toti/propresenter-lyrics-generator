import { getJsonAs, postJsonAs } from "@/lib/postJson";
import { maskedApiKeyReplySchema, type ApiKeyRequest } from "@/lib/desktop/envEntry";
import {
  addToPlaylistReplySchema,
  exportConflictReplySchema,
  exportSavedReplySchema,
  pingReplySchema,
  playlistsReplySchema,
  type AddToPlaylistReply,
  type PingReply,
  type PlaylistsReply,
} from "@/lib/propresenter/contracts";
import type { ExportConflict } from "@/lib/propresenter/libraries";
import type { Song } from "@/lib/types";

/** The studio's and Ajustes' way to the playlist, ping, export and settings routes. */

export function fetchPlaylists(port: number): Promise<PlaylistsReply> {
  return postJsonAs("/api/playlists/list", { port }, playlistsReplySchema);
}

export function addToPlaylist(request: {
  port: number;
  playlistId: string;
  /** The exported filename without ".pro", which is what ProPresenter names the library item. */
  presentationName: string;
}): Promise<AddToPlaylistReply> {
  return postJsonAs("/api/playlists/add-item", request, addToPlaylistReplySchema);
}

export function testProPresenterConnection(port: number): Promise<PingReply> {
  return postJsonAs("/api/propresenter/ping", { port }, pingReplySchema);
}

/** The same-named file in any library, or null. Never throws: when the check can't run, the
 * export writes a uniquely named file (" (2)") instead of overwriting, so going on is safe. */
export async function findExportConflict(libraryFolder: string, name: string): Promise<ExportConflict | null> {
  try {
    const { conflict } = await postJsonAs("/api/export/check-conflict", { libraryFolder, name }, exportConflictReplySchema);
    return conflict;
  } catch {
    return null;
  }
}

/** Writes the song as a .pro file into a library folder, and answers the path actually written. */
export async function exportToLibraryFolder(request: {
  song: Song;
  destinationFolder: string;
  fileName?: string;
  overwritePath?: string;
}): Promise<string> {
  const { savedTo } = await postJsonAs("/api/export/propresenter", request, exportSavedReplySchema);
  return savedTo;
}

export async function readMaskedApiKey(endpoint: string): Promise<string | null> {
  const { masked } = await getJsonAs(endpoint, maskedApiKeyReplySchema);
  return masked;
}

export async function saveApiKey(endpoint: string, apiKey: string): Promise<string | null> {
  const request: ApiKeyRequest = { apiKey };
  const { masked } = await postJsonAs(endpoint, request, maskedApiKeyReplySchema);
  return masked;
}
