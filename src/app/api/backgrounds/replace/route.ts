import { NextResponse } from "next/server";
import type { SlotChangeReply } from "@/lib/propresenter/backgrounds/contracts";
import { replaceSlotFile } from "@/lib/propresenter/backgrounds/replace";
import { replaceSlotRequestSchema } from "@/lib/propresenter/backgrounds/requests";
import { backgroundsErrorResponse, invalidRequestResponse } from "@/lib/propresenter/backgrounds/routeError";

/** Overwrites a slot's file with the one the user picked, keeping its path and name. The file to
 * overwrite is looked up from the macros by slot id; the client only ever names the source (and,
 * for an image going onto a video slot, sends it already made into a still video). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = replaceSlotRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequestResponse();

  const { folder, slotId, sourcePath, video } = parsed.data;
  try {
    const slot = await replaceSlotFile(folder, slotId, sourcePath, video ? Buffer.from(video, "base64") : undefined);
    return NextResponse.json({ slot } satisfies SlotChangeReply);
  } catch (err) {
    return backgroundsErrorResponse(err, "replace", "Não foi possível trocar o arquivo.");
  }
}
