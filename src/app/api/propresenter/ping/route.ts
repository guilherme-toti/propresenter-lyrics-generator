import { NextResponse } from "next/server";
import { z } from "zod";
import { isDesktopServer } from "@/lib/desktop/envFile";
import { pingProPresenter } from "@/lib/propresenter/api";

const bodySchema = z.object({ port: z.number().int().positive() });

/** Desktop-only: backs the "Testar conexão" button in Ajustes. A failed connection is a
 * reportable result, not a request error, so it comes back 200 with ok:false. */
export async function POST(request: Request) {
  if (!isDesktopServer()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Porta inválida." }, { status: 400 });
  }

  try {
    const { name, hostDescription } = await pingProPresenter(parsed.data.port);
    return NextResponse.json({ ok: true, name, hostDescription });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao conectar.",
    });
  }
}
