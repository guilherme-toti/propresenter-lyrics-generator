import { NextResponse } from "next/server";
import type { SlotChangeReply } from "@/lib/propresenter/backgrounds/contracts";
import { undoLastReplace } from "@/lib/propresenter/backgrounds/replace";
import { undoSlotRequestSchema } from "@/lib/propresenter/backgrounds/requests";
import { backgroundsErrorResponse, invalidRequestResponse } from "@/lib/propresenter/backgrounds/routeError";

/** Restores the file the latest replace on this slot backed up. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = undoSlotRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequestResponse();

  try {
    const slot = await undoLastReplace(parsed.data.folder, parsed.data.slotId);
    return NextResponse.json({ slot } satisfies SlotChangeReply);
  } catch (err) {
    return backgroundsErrorResponse(err, "undo", "Não foi possível desfazer a troca.");
  }
}
