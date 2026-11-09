import { NextResponse } from "next/server";
import { rejectDesktopOnlyRequest } from "@/lib/desktop/desktopServer";
import { apiKeyRequestSchema } from "@/lib/desktop/envEntry";
import { getMaskedApiKey, saveApiKey } from "@/lib/desktop/envFile";

const KEY_NAME = "OPENROUTER_API_KEY";

export async function GET(request: Request) {
  const rejection = rejectDesktopOnlyRequest(request);
  if (rejection) return rejection;

  const masked = await getMaskedApiKey(KEY_NAME);
  return NextResponse.json({ masked });
}

export async function POST(request: Request) {
  const rejection = rejectDesktopOnlyRequest(request);
  if (rejection) return rejection;

  const body = await request.json().catch(() => null);
  const parsed = apiKeyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requisição inválida." }, { status: 400 });
  }

  try {
    const masked = await saveApiKey(KEY_NAME, parsed.data.apiKey);
    return NextResponse.json({ masked });
  } catch (error) {
    console.error("saving OPENROUTER_API_KEY failed", error);
    return NextResponse.json({ error: "Não foi possível salvar a chave." }, { status: 500 });
  }
}
