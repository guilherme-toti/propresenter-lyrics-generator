import type { NextRequest } from "next/server";
import { findSlotRef } from "@/lib/propresenter/backgrounds/library";
import { previewQuerySchema } from "@/lib/propresenter/backgrounds/requests";
import { invalidRequestResponse } from "@/lib/propresenter/backgrounds/routeError";
import { mediaFileResponse, mediaNotFoundResponse } from "@/lib/propresenter/backgrounds/serveMedia";

/** A slot's file, for its screen on the Backgrounds page. Takes a slot id rather than a path and
 * resolves it against the macros, so only files a macro shows can ever be read here. */
export async function GET(request: NextRequest) {
  const parsed = previewQuerySchema.safeParse({
    folder: request.nextUrl.searchParams.get("folder"),
    slot: request.nextUrl.searchParams.get("slot"),
  });
  if (!parsed.success) return invalidRequestResponse();

  const slot = await findSlotRef(parsed.data.folder, parsed.data.slot).catch(() => null);
  if (!slot) return mediaNotFoundResponse();
  return mediaFileResponse(slot.filePath, slot.fileName, request.headers.get("range"));
}
