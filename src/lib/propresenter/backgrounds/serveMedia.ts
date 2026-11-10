import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { parseByteRange } from "@/lib/byteRange";
import { fileStream } from "./fileStream";
import { contentTypeFor } from "./media";

export function mediaNotFoundResponse(): NextResponse {
  return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
}


/**
 * Serves an image or video to the Backgrounds screen's <img> and <video>. Callers resolve the path
 * themselves from an id, so a request can never name a file. Range requests are honoured because
 * <video> needs them to seek and to show a first frame.
 */
export async function mediaFileResponse(filePath: string, fileName: string, rangeHeader: string | null): Promise<Response> {
  // Only images and videos are ever served, whatever the path happens to point at.
  const contentType = contentTypeFor(fileName);
  if (!contentType) return NextResponse.json({ error: "Esse arquivo não tem prévia." }, { status: 415 });
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return mediaNotFoundResponse();

  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    // Callers put a version in the URL, so a replaced file is a new URL anyway; storing nothing
    // keeps a stale frame from ever surviving a replace.
    "Cache-Control": "no-store",
  });

  const range = parseByteRange(rangeHeader, stat.size);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${stat.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    return new Response(fileStream(filePath, range), { status: 206, headers });
  }

  headers.set("Content-Length", String(stat.size));
  return new Response(fileStream(filePath), { status: 200, headers });
}
