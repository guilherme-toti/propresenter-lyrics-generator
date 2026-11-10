import { NextResponse } from "next/server";
import type { SlotChangeReply } from "@/lib/propresenter/backgrounds/contracts";
import { redoLastUndo } from "@/lib/propresenter/backgrounds/replace";
import { redoSlotRequestSchema } from "@/lib/propresenter/backgrounds/requests";
import { backgroundsErrorResponse, invalidRequestResponse } from "@/lib/propresenter/backgrounds/routeError";

/** Puts back the file the latest undo on this slot took off. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = redoSlotRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequestResponse();

  try {
    const slot = await redoLastUndo(parsed.data.folder, parsed.data.slotId);
    return NextResponse.json({ slot } satisfies SlotChangeReply);
  } catch (err) {
    return backgroundsErrorResponse(err, "redo", "Não foi possível refazer a troca.");
  }
}
