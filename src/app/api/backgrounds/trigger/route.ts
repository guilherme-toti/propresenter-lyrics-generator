import { NextResponse } from "next/server";
import { clearMacroLayers, ProPresenterError, triggerMacro } from "@/lib/propresenter/api";
import { waitForVideoLengths } from "@/lib/propresenter/backgrounds/lengthSync";
import { triggerMacroRequestSchema } from "@/lib/propresenter/backgrounds/requests";
import { invalidRequestResponse } from "@/lib/propresenter/backgrounds/routeError";

/** Runs a macro on ProPresenter so the user can see a swapped file live. An unreachable
 * ProPresenter is a result to show (200 with `ok: false`), as in /api/propresenter/ping.
 *
 * Shows the files as they are now, which takes two things (both checked on ProPresenter 21.4):
 * - waiting until ProPresenter has re-read a just-swapped video's length (see lengthSync.ts);
 * - clearing the macro layers first, since ProPresenter reopens a macro's file only when it isn't
 *   on screen already. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = triggerMacroRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequestResponse();

  try {
    const { port, folder, macroUuid } = parsed.data;
    await waitForVideoLengths(folder, macroUuid);
    await clearMacroLayers(port);
    await triggerMacro(port, macroUuid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("backgrounds/trigger failed", err);
    // The macro list comes from ProPresenter's file on disk, so a 404 means the screen is showing a
    // macro deleted since; "Atualizar" re-reads that file.
    const macroGone = err instanceof ProPresenterError && err.status === 404;
    return NextResponse.json({
      ok: false,
      error: macroGone
        ? "Essa macro não está mais no ProPresenter. Talvez tenha sido apagada; clique em “Atualizar” para ver as macros de agora."
        : "O ProPresenter não rodou a macro. Confira se ele está aberto e com a rede ativada nas preferências.",
    });
  }
}
