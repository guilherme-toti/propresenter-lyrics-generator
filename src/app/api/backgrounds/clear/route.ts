import { NextResponse } from "next/server";
import { clearMacroLayers } from "@/lib/propresenter/api";
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
    console.error("backgrounds/clear failed", err);
    return NextResponse.json({
      ok: false,
      error: "O ProPresenter não limpou a tela. Confira se ele está aberto e com a rede ativada nas preferências.",
    });
  }
}
