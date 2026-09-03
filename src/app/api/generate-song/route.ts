import { NextResponse } from "next/server";
import { z } from "zod";
import { aiResponseToSong } from "@/lib/ai/toSong";
import {
  generateSongWithAi,
  OpenRouterConfigError,
  OpenRouterResponseError,
  OpenRouterUnknownSongError,
} from "@/lib/ai/openrouter";

const requestSchema = z.object({
  query: z.string().trim().min(2, "Digite o título de uma música, um trecho da letra ou uma breve descrição."),
  /** Set when the user picked a specific recording from the catalogue search. */
  picked: z
    .object({
      commontrackId: z.number(),
      title: z.string(),
      artist: z.string(),
      language: z.string().default(""),
      trackRating: z.number().default(0),
    })
    .optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requisição inválida." }, { status: 400 });
  }

  try {
    const { song: aiResponse, attribution } = await generateSongWithAi(parsed.data.query, parsed.data.picked);
    const song = aiResponseToSong(aiResponse, attribution);
    return NextResponse.json({ song });
  } catch (error) {
    if (error instanceof OpenRouterConfigError) {
      return NextResponse.json({ error: error.message }, { status: 501 });
    }
    if (error instanceof OpenRouterUnknownSongError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof OpenRouterResponseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("generate-song failed", error);
    return NextResponse.json({ error: "Algo deu errado ao gerar esta música. Tente novamente." }, { status: 500 });
  }
}
