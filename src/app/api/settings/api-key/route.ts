import { NextResponse } from "next/server";
import { apiKeyRequestSchema, USER_ENV_KEYS } from "@/lib/desktop/envEntry";
import { getMaskedApiKey, saveApiKey } from "@/lib/desktop/envFile";

const KEY_NAME = USER_ENV_KEYS.openRouter;

export async function GET() {
  const masked = await getMaskedApiKey(KEY_NAME);
  return NextResponse.json({ masked });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = apiKeyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requisição inválida." }, { status: 400 });
  }

  try {
    const masked = await saveApiKey(KEY_NAME, parsed.data.apiKey);
    return NextResponse.json({ masked });
  } catch (error) {
    console.error(`saving ${KEY_NAME} failed`, error);
    return NextResponse.json({ error: "Não foi possível salvar a chave." }, { status: 500 });
  }
}
