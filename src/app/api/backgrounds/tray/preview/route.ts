import type { NextRequest } from "next/server";
import { trayPreviewQuerySchema } from "@/lib/propresenter/backgrounds/requests";
import { invalidRequestResponse } from "@/lib/propresenter/backgrounds/routeError";
import { mediaFileResponse, mediaNotFoundResponse } from "@/lib/propresenter/backgrounds/serveMedia";
import { findRememberedFile } from "@/lib/propresenter/backgrounds/trayRegistry";

/** A tray file's preview, by the id the tray route gave it. */
export async function GET(request: NextRequest) {
  const parsed = trayPreviewQuerySchema.safeParse({ id: request.nextUrl.searchParams.get("id") });
  if (!parsed.success) return invalidRequestResponse();

  const file = findRememberedFile(parsed.data.id);
  if (!file) return mediaNotFoundResponse();
  return mediaFileResponse(file.filePath, file.fileName, request.headers.get("range"));
}
