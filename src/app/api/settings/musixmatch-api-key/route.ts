import { NextResponse } from "next/server";
import { z } from "zod";
import { getMaskedApiKey, isDesktopServer, saveApiKey } from "@/lib/desktop/envFile";

const KEY_NAME = "MUSIXMATCH_API_KEY";

const requestSchema = z.object({
  apiKey: z.string().trim().min(1, "Cole uma chave válida."),
});

export async function GET() {
  if (!isDesktopServer()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const masked = await getMaskedApiKey(KEY_NAME);
  return NextResponse.json({ masked });
}

export async function POST(request: Request) {
  if (!isDesktopServer()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requisição inválida." }, { status: 400 });
  }

  try {
    const masked = await saveApiKey(KEY_NAME, parsed.data.apiKey);
    return NextResponse.json({ masked });
  } catch (error) {
    console.error("saving MUSIXMATCH_API_KEY failed", error);
    return NextResponse.json({ error: "Não foi possível salvar a chave." }, { status: 500 });
  }
}
