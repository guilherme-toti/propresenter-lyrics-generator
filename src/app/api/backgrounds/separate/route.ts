import { NextResponse } from "next/server";
import type { SeparateSlotReply } from "@/lib/propresenter/backgrounds/contracts";
import { separateSlotRequestSchema } from "@/lib/propresenter/backgrounds/requests";
import { backgroundsErrorResponse, invalidRequestResponse } from "@/lib/propresenter/backgrounds/routeError";
import { separateSlotFile } from "@/lib/propresenter/backgrounds/separate";

/** Gives one macro's screen a file of its own, next to the original: a copy of a shared file, or
 * its image as a still video. The macros aren't touched. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = separateSlotRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequestResponse();

  try {
    const { video, ...target } = parsed.data;
    const reply = await separateSlotFile(target, video ? Buffer.from(video, "base64") : undefined);
    return NextResponse.json(reply satisfies SeparateSlotReply);
  } catch (err) {
    return backgroundsErrorResponse(err, "separate", "Não deu pra fazer a cópia. Tente de novo.");
  }
}
