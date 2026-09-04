import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchLyricsByTrackId } from "@/lib/lyrics/musixmatch";

const requestSchema = z.object({
  commontrackId: z.number(),
});

/**
 * Backs the per-language "buscar gravação" swap: the client already has the picked track's
 * title/artist/commontrackId from /api/songs/search, so this only needs to fetch that exact
 * recording's raw lyrics — no language detection, translation, or pairing involved.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requisição inválida." }, { status: 400 });
  }

  const lyrics = await fetchLyricsByTrackId(parsed.data.commontrackId);
  if (!lyrics) {
    return NextResponse.json(
      { error: 'Essa gravação está indisponível no momento (letra restrita ou não encontrada). Escolha outra.' },
      { status: 404 },
    );
  }

  return NextResponse.json({ text: lyrics.text, copyright: lyrics.copyright, trackingUrl: lyrics.trackingPixelUrl });
}
