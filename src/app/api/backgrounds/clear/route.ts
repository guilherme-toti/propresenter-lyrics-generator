import { NextResponse } from "next/server";
import { clearMacroLayers, proPresenterFailureMessage } from "@/lib/propresenter/api";
import { clearScreenRequestSchema } from "@/lib/propresenter/backgrounds/requests";
import { invalidRequestResponse } from "@/lib/propresenter/backgrounds/routeError";

/** "Limpar tela": takes backgrounds and props off the output, which on Windows is also what frees
 * a file that's on screen to be replaced. Same 200 `ok: false` convention as /trigger. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = clearScreenRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequestResponse();

  try {
    await clearMacroLayers(parsed.data.port);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: proPresenterFailureMessage(err, "backgrounds/clear", "O ProPresenter não limpou a tela. Tente de novo."),
    });
  }
}
