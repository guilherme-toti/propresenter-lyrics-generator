import { NextResponse } from "next/server";
import { z } from "zod";
import { aiResponseToSong } from "@/lib/ai/toSong";
import { generateSongWithAi, OpenRouterConfigError, OpenRouterResponseError } from "@/lib/ai/openrouter";

const requestSchema = z.object({
  query: z.string().trim().min(2, "Tell us a song title, a lyric snippet, or a short description."),
  targetLanguage: z.string().trim().optional().default(""),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const aiResponse = await generateSongWithAi(parsed.data.query, parsed.data.targetLanguage);
    const song = aiResponseToSong(aiResponse);
    return NextResponse.json({ song });
  } catch (error) {
    if (error instanceof OpenRouterConfigError) {
      return NextResponse.json({ error: error.message }, { status: 501 });
    }
    if (error instanceof OpenRouterResponseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("generate-song failed", error);
    return NextResponse.json({ error: "Something went wrong generating this song. Please try again." }, { status: 500 });
  }
}
