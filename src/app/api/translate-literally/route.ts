import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAlignmentFromAiSections } from "@/lib/alignment";
import { OpenRouterConfigError, OpenRouterResponseError, translateLiterally } from "@/lib/ai/openrouter";
import { reconstructRaw } from "@/lib/ai/toSong";
import { pairLineAligned } from "@/lib/lyrics/musixmatch";

const requestSchema = z.object({
  // The side that already has real content — never the blank one, which is what this fills in.
  knownSide: z.enum(["languageA", "languageB"]),
  knownText: z.string().trim().min(1, "O outro lado está vazio — não há o que traduzir."),
  targetLanguage: z.enum(["English", "Português (Brasil)"]),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requisição inválida." }, { status: 400 });
  }
  const { knownSide, knownText, targetLanguage } = parsed.data;

  try {
    const translatedText = await translateLiterally(knownText, targetLanguage, request.signal);

    // aText/bText, not "original"/"translation" — pairLineAligned's two positional args become
    // AlignedLine's "a"/"b" via buildAlignmentFromAiSections below, and those must land in the
    // editor they actually belong to regardless of which one was the known side.
    const aText = knownSide === "languageA" ? knownText : translatedText;
    const bText = knownSide === "languageA" ? translatedText : knownText;
    const paired = pairLineAligned(aText, bText);
    if (!paired) {
      return NextResponse.json(
        { error: "A tradução não manteve a mesma estrutura da letra original. Tente novamente." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      languageARaw: reconstructRaw(paired, "original"),
      languageBRaw: reconstructRaw(paired, "translation"),
      alignment: buildAlignmentFromAiSections(paired),
    });
  } catch (error) {
    if (error instanceof OpenRouterConfigError) {
      return NextResponse.json({ error: error.message }, { status: 501 });
    }
    if (error instanceof OpenRouterResponseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("translate-literally failed", error);
    return NextResponse.json({ error: "Algo deu errado ao traduzir esta música. Tente novamente." }, { status: 500 });
  }
}
