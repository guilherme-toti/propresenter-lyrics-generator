import { NextResponse } from "next/server";
import { driveDownloadRequestSchema, type DriveDownloadEvent } from "@/lib/drive/contracts";
import { DriveError } from "@/lib/drive/driveError";
import { downloadDriveFile } from "@/lib/drive/googleDrive";

// Progress has to reach the window as it happens, not once the download is over.
export const dynamic = "force-dynamic";

/** Often enough for a smooth bar, rare enough not to flood the window on a fast connection. */
const PROGRESS_INTERVAL_MS = 150;

/**
 * Downloads one Drive file to this computer, answering one JSON line per event: progress while it
 * downloads, then where the file is ("done") or what went wrong ("error"). Closing the window's
 * request cancels the download.
 */
export async function POST(request: Request) {
  const parsed = driveDownloadRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const { file } = parsed.data;

  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Once the window has gone, writing to the stream would throw, so nothing more is sent.
      const send = (event: DriveDownloadEvent) => {
        if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      let lastProgressAt = 0;
      try {
        const filePath = await downloadDriveFile(
          file,
          (received, total) => {
            const now = Date.now();
            if (now - lastProgressAt < PROGRESS_INTERVAL_MS && received !== total) return;
            lastProgressAt = now;
            send({ type: "progress", received, total });
          },
          signal,
        );
        send({ type: "done", path: filePath });
      } catch (err) {
        if (!signal.aborted) {
          if (!(err instanceof DriveError)) console.error("drive/download failed", err);
          send({
            type: "error",
            message: err instanceof DriveError ? err.message : "Não foi possível baixar esse arquivo.",
          });
        }
      }
      if (!cancelled) controller.close();
    },
    cancel() {
      cancelled = true;
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
