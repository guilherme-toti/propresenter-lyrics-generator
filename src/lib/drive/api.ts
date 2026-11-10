import { getJsonAs, postJsonAs } from "@/lib/postJson";
import {
  driveDownloadEventSchema,
  driveFolderReplySchema,
  serviceAccountReplySchema,
  type DriveFolderReply,
  type DriveRef,
  type ServiceAccountRequest,
} from "./contracts";

/** The Drive browser's way to the /api/drive routes. */

const BROKEN_OFF = "O download parou no meio. Confira a internet e tente de novo.";

export function openDriveFolder(folder: DriveRef, signal: AbortSignal): Promise<DriveFolderReply> {
  return postJsonAs("/api/drive/folder", { folder }, driveFolderReplySchema, { signal });
}

/** One line of the answer, or null for one that can't be read (logged, then skipped). */
function parseEvent(line: string) {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    json = null;
  }
  const event = driveDownloadEventSchema.safeParse(json);
  if (event.success) return event.data;
  console.error("drive/download answered a line in an unexpected shape", line);
  return null;
}

/** The answer comes a line at a time: progress while the server downloads, then the file's path or
 * what went wrong. */
async function readDownloadEvents(
  body: ReadableStream<Uint8Array>,
  onProgress: (received: number, total: number | null) => void,
): Promise<{ path: string } | { error: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { error: BROKEN_OFF };
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      const event = line.trim() ? parseEvent(line) : null;
      if (event?.type === "progress") onProgress(event.received, event.total);
      else if (event?.type === "done") return { path: event.path };
      else if (event?.type === "error") return { error: event.message };
    }
  }
}

/** Downloads a Drive file to this computer and answers its path there, ready for the tray. */
export async function downloadDriveFile(
  file: DriveRef,
  onProgress: (received: number, total: number | null) => void,
  signal: AbortSignal,
): Promise<string> {
  let outcome: { path: string } | { error: string };
  try {
    const res = await fetch("/api/drive/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file }),
      signal,
    });
    if (res.ok && res.body) {
      outcome = await readDownloadEvents(res.body, onProgress);
    } else {
      const reply: unknown = await res.json().catch(() => null);
      const error = reply !== null && typeof reply === "object" && "error" in reply ? reply.error : null;
      outcome = { error: typeof error === "string" ? error : BROKEN_OFF };
    }
  } catch (err) {
    // A cancel the caller asked for isn't a failure to report; it checks for the AbortError itself.
    if (signal.aborted) throw err;
    console.error("POST /api/drive/download failed", err);
    outcome = { error: BROKEN_OFF };
  }
  if ("error" in outcome) throw new Error(outcome.error);
  return outcome.path;
}

const SERVICE_ACCOUNT_ENDPOINT = "/api/settings/google-service-account";

/** The service account's email, or null when none is set up. */
export async function readServiceAccountEmail(): Promise<string | null> {
  return (await getJsonAs(SERVICE_ACCOUNT_ENDPOINT, serviceAccountReplySchema)).email;
}

/** Hands the server the .json key the user picked; answers the account's email. */
export async function saveServiceAccount(request: ServiceAccountRequest): Promise<string | null> {
  return (await postJsonAs(SERVICE_ACCOUNT_ENDPOINT, request, serviceAccountReplySchema)).email;
}
