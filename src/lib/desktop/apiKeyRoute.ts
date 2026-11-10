import { NextResponse } from "next/server";
import { apiKeyRequestSchema, type UserEnvKey } from "./envEntry";
import { getMaskedApiKey, saveApiKey } from "./envFile";

/** The GET and POST of an /api/settings/*-api-key route: reading answers the key masked, never in
 * full, and saving answers the new one masked. */
export function apiKeyRouteHandlers(keyName: UserEnvKey) {
  async function GET() {
    const masked = await getMaskedApiKey(keyName);
    return NextResponse.json({ masked });
  }

  async function POST(request: Request) {
    const body = await request.json().catch(() => null);
    const parsed = apiKeyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requisição inválida." }, { status: 400 });
    }

    try {
      const masked = await saveApiKey(keyName, parsed.data.apiKey);
      return NextResponse.json({ masked });
    } catch (error) {
      console.error(`saving ${keyName} failed`, error);
      return NextResponse.json({ error: "Não foi possível salvar a chave." }, { status: 500 });
    }
  }

  return { GET, POST };
}
