import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAlignmentFromAiSections } from "@/lib/alignment";
import { OpenRouterConfigError, OpenRouterResponseError, realignSongWithAi } from "@/lib/ai/openrouter";
import { reconstructRaw } from "@/lib/ai/toSong";

const requestSchema = z
  .object({
    languageARaw: z.string(),
    languageBRaw: z.string(),
  })
  .refine((data) => data.languageARaw.trim().length > 0 || data.languageBRaw.trim().length > 0, {
    message: "Add lyrics to at least one editor before using AI re-align.",
  });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  try {
    const aiResponse = await realignSongWithAi(parsed.data.languageARaw, parsed.data.languageBRaw);
    const alignment = buildAlignmentFromAiSections(aiResponse.sections);
    const languageARaw = reconstructRaw(aiResponse.sections, "original");
    const languageBRaw = reconstructRaw(aiResponse.sections, "translation");
    return NextResponse.json({ languageARaw, languageBRaw, alignment });
  } catch (error) {
    if (error instanceof OpenRouterConfigError) {
      return NextResponse.json({ error: error.message }, { status: 501 });
    }
    if (error instanceof OpenRouterResponseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("realign-song failed", error);
    return NextResponse.json({ error: "Something went wrong re-aligning this song. Please try again." }, { status: 500 });
  }
}
