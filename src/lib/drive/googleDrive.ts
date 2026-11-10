import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getAppCacheDir } from "@/lib/desktop/appConfigDir";
import { stripUnsafeFileNameCharacters } from "@/lib/fileNames";
import { acceptedMediaType, extensionOf } from "@/lib/propresenter/backgrounds/media";
import type { DriveEntry, DriveFolderReply, DriveRef } from "./contracts";
import { DriveError } from "./driveError";
import { FOLDER_MIME_TYPE, toDriveEntries, type DriveApiFile } from "./driveListing";
import { driveAccessToken } from "./serviceAccount";

const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const METADATA_TIMEOUT_MS = 15_000;
/** Drive's largest page; a weekly folder never comes close. */
const PAGE_SIZE = 1000;
/** Pages read before giving up on a folder too big to browse anyway. */
const MAX_PAGES = 5;
/** Downloads untouched this long are deleted. The tray forgets its files when the app closes, so
 * nothing older is still waiting to be sent. */
const KEEP_DOWNLOADS_MS = 7 * 24 * 60 * 60 * 1000;

const NOT_ACCEPTED = "Só dá pra usar imagens (PNG, JPG, WebP) e vídeos MP4.";

const driveFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  modifiedTime: z.string().optional(),
  size: z.string().optional(),
  resourceKey: z.string().optional(),
  thumbnailLink: z.string().optional(),
  shortcutDetails: z
    .object({ targetId: z.string(), targetMimeType: z.string().optional(), targetResourceKey: z.string().optional() })
    .optional(),
}) satisfies z.ZodType<DriveApiFile>;

const LIST_FIELDS =
  "nextPageToken,files(id,name,mimeType,modifiedTime,size,resourceKey,thumbnailLink,shortcutDetails(targetId,targetMimeType,targetResourceKey))";
const driveListPageSchema = z.object({ nextPageToken: z.string().optional(), files: z.array(driveFileSchema) });

const googleErrorSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});

/** `email` is the service account's: what was asked for has to be shared with it. */
async function driveErrorFrom(res: Response, email: string): Promise<DriveError> {
  const parsed = googleErrorSchema.safeParse(await res.json().catch(() => null));
  const reason = parsed.success ? parsed.data.error.errors?.[0]?.reason : undefined;
  console.error(`Google Drive answered ${res.status}`, parsed.success ? parsed.data.error : "(no error body)");

  if (res.status === 404) {
    return new DriveError(
      `Não achamos isso no Google Drive. Confira o link e se a pasta está compartilhada com ${email} como Leitor.`,
      404,
    );
  }
  if (res.status === 429 || reason?.toLowerCase().includes("ratelimit")) {
    return new DriveError("O Google Drive pediu uma pausa. Tente de novo em um minuto.", 429);
  }
  if (reason === "downloadQuotaExceeded") {
    return new DriveError("Esse arquivo foi baixado muitas vezes hoje e o Google Drive travou ele. Tente mais tarde.", 429);
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    return new DriveError(
      `O Google Drive não deixou ${email} abrir isso. Confira se a pasta está compartilhada com esse e-mail e se a Google Drive API está ativada no projeto da conta de serviço.`,
      502,
    );
  }
  return new DriveError("O Google Drive não respondeu. Tente de novo em instantes.", 502);
}

/** Calls Drive as the service account, with the item's resource key when its link needs one. */
async function driveFetch(
  ref: DriveRef,
  url: string,
  params: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  const { token, email } = await driveAccessToken(signal);
  const query = new URLSearchParams({ ...params, supportsAllDrives: "true" });
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (ref.resourceKey) headers["X-Goog-Drive-Resource-Keys"] = `${ref.id}/${ref.resourceKey}`;
  let res: Response;
  try {
    res = await fetch(`${url}?${query.toString()}`, { headers, signal });
  } catch (err) {
    if (signal.aborted) throw err;
    console.error("Google Drive unreachable", err);
    throw new DriveError("Sem conexão com o Google Drive. Confira a internet e tente de novo.", 502);
  }
  if (!res.ok) throw await driveErrorFrom(res, email);
  return res;
}

async function driveJson<S extends z.ZodType>(
  ref: DriveRef,
  url: string,
  params: Record<string, string>,
  schema: S,
  signal: AbortSignal,
): Promise<z.output<S>> {
  const res = await driveFetch(ref, url, params, AbortSignal.any([signal, AbortSignal.timeout(METADATA_TIMEOUT_MS)]));
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    console.error("Google Drive answered in an unexpected shape", parsed.error.issues);
    throw new DriveError("O Google Drive respondeu de um jeito inesperado. Tente de novo.", 502);
  }
  return parsed.data;
}

function mediaTypeOf(fileName: string) {
  return acceptedMediaType(extensionOf(fileName));
}

/** Plenty for the folders opened in one session, and keeps the map from growing forever. */
const MAX_THUMBNAILS = 2000;
/** Drive serves thumbnails from these hosts only; anything else is not fetched. */
const THUMBNAIL_HOSTS = /(^|\.)(googleusercontent\.com|google\.com)$/;

/** Thumbnail links by file id, from the folders listed since the server started. The window asks
 * for a thumbnail by id, so this server only ever fetches links Drive itself gave it. On globalThis
 * because Next can load this module once per route bundle. */
function thumbnailLinks(): Map<string, string> {
  const store = globalThis as typeof globalThis & { __pmaDriveThumbnails?: Map<string, string> };
  store.__pmaDriveThumbnails ??= new Map();
  return store.__pmaDriveThumbnails;
}

/** Remembers each file's Drive thumbnail and points the window at this server's copy instead: a
 * folder shared only with someone's account has thumbnails that only load with its credentials. */
function serveThumbnailsLocally(entries: DriveEntry[]): DriveEntry[] {
  const links = thumbnailLinks();
  return entries.map((entry) => {
    if (!entry.thumbnailUrl) return entry;
    links.delete(entry.id);
    links.set(entry.id, entry.thumbnailUrl);
    while (links.size > MAX_THUMBNAILS) {
      const oldest = links.keys().next().value;
      if (oldest === undefined) break;
      links.delete(oldest);
    }
    return { ...entry, thumbnailUrl: `/api/drive/thumbnail?${new URLSearchParams({ id: entry.id }).toString()}` };
  });
}

/** A listed file's thumbnail, as Drive serves it; null when it isn't known or doesn't load. Sent
 * with the service account's token, since a folder shared only with it has thumbnails that need it. */
export async function fetchDriveThumbnail(fileId: string, signal: AbortSignal): Promise<Response | null> {
  const link = thumbnailLinks().get(fileId);
  if (!link || !THUMBNAIL_HOSTS.test(new URL(link).hostname)) return null;
  try {
    const { token } = await driveAccessToken(signal);
    const res = await fetch(link, { headers: { Authorization: `Bearer ${token}` }, signal });
    return res.ok && res.body ? res : null;
  } catch {
    return null;
  }
}

/** The folder's name and what's in it: subfolders, then files, newest first. */
export async function openDriveFolder(folder: DriveRef, signal: AbortSignal): Promise<DriveFolderReply> {
  const meta = await driveJson(folder, `${FILES_URL}/${folder.id}`, { fields: "id,name,mimeType" }, driveFileSchema, signal);
  if (meta.mimeType !== FOLDER_MIME_TYPE) {
    throw new DriveError("Esse link é de um arquivo, não de uma pasta. Cole o link da pasta onde ele está.", 400);
  }

  const files: DriveApiFile[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params: Record<string, string> = {
      q: `'${folder.id}' in parents and trashed = false`,
      fields: LIST_FIELDS,
      pageSize: String(PAGE_SIZE),
      includeItemsFromAllDrives: "true",
    };
    if (pageToken) params.pageToken = pageToken;
    const result = await driveJson(folder, FILES_URL, params, driveListPageSchema, signal);
    files.push(...result.files);
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }

  return { name: meta.name, entries: serveThumbnailsLocally(toDriveEntries(files, mediaTypeOf)) };
}

function driveDownloadsDir(): string {
  return path.join(getAppCacheDir(), "google-drive");
}

/** Each download lives in its own folder named after the file's id and version, so two files with
 * the same name never collide, and a file changed in Drive is downloaded again. */
function downloadFolderFor(fileId: string, modifiedTime: string | undefined): string {
  return path.join(driveDownloadsDir(), `${fileId}-${Date.parse(modifiedTime ?? "") || 0}`);
}

async function forgetOldDownloads(keep: string): Promise<void> {
  const root = driveDownloadsDir();
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const cutoff = Date.now() - KEEP_DOWNLOADS_MS;
  for (const entry of entries) {
    const dir = path.join(root, entry.name);
    if (!entry.isDirectory() || dir === keep) continue;
    const stat = await fs.stat(dir).catch(() => null);
    if (stat && stat.mtimeMs < cutoff) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function writeBody(body: ReadableStream<Uint8Array>, filePath: string, onBytes: (received: number) => void) {
  const handle = await fs.open(filePath, "w");
  try {
    const reader = body.getReader();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      await handle.write(value);
      received += value.byteLength;
      onBytes(received);
    }
  } finally {
    await handle.close();
  }
}

/**
 * Downloads a file the tray can take and answers where it is on this computer. A file already
 * downloaded at the same version is reused. The download goes to a ".part" file first, so a
 * cancelled or broken one never passes for the whole file.
 */
export async function downloadDriveFile(
  file: DriveRef,
  onProgress: (received: number, total: number | null) => void,
  signal: AbortSignal,
): Promise<string> {
  const meta = await driveJson(
    file,
    `${FILES_URL}/${file.id}`,
    { fields: "id,name,mimeType,modifiedTime,size" },
    driveFileSchema,
    signal,
  );
  const fileName = stripUnsafeFileNameCharacters(meta.name).normalize("NFC");
  if (!fileName || !mediaTypeOf(fileName)) throw new DriveError(NOT_ACCEPTED, 400);

  const total = meta.size ? Number(meta.size) : null;
  const dir = downloadFolderFor(meta.id, meta.modifiedTime);
  const filePath = path.join(dir, fileName);

  const existing = await fs.stat(filePath).catch(() => null);
  if (existing?.isFile() && (total === null || existing.size === total)) {
    // Touched, so the cleanup counts it as fresh.
    const now = new Date();
    await fs.utimes(dir, now, now).catch(() => undefined);
    onProgress(existing.size, total);
    return filePath;
  }

  await fs.mkdir(dir, { recursive: true });
  await forgetOldDownloads(dir);

  const res = await driveFetch(file, `${FILES_URL}/${file.id}`, { alt: "media" }, signal);
  if (!res.body) throw new DriveError("O Google Drive não mandou o arquivo. Tente de novo.", 502);

  const partPath = `${filePath}.part`;
  try {
    await writeBody(res.body, partPath, (received) => onProgress(received, total));
    await fs.rename(partPath, filePath);
  } catch (err) {
    await fs.rm(partPath, { force: true }).catch(() => undefined);
    if (signal.aborted) throw err;
    console.error("Google Drive download broke off", err);
    throw new DriveError("O download parou no meio. Confira a internet e tente de novo.", 502);
  }
  return filePath;
}
