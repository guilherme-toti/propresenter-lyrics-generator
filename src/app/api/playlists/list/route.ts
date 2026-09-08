import { NextResponse } from "next/server";
import { z } from "zod";
import { isDesktopServer } from "@/lib/desktop/envFile";
import { listPlaylists } from "@/lib/propresenter/api";

const bodySchema = z.object({
  port: z.number().int().min(1).max(65535),
});

/** Desktop-only: lists the playlists a user could export into, read from ProPresenter's
 * HTTP API instead of decoding its playlist files (see `api.ts`'s module doc for why the
 * file-reading approach was replaced).
 *
 * A thrown error is not a request error: the port was valid, ProPresenter just couldn't be
 * reached or misbehaved. Callers need to tell "no playlists" apart from "couldn't ask", so
 * this responds 200 with an empty list and the Portuguese error message rather than
 * failing the request, exactly like add-item treats a failed add. */
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
    const playlists = await listPlaylists(parsed.data.port);
    return NextResponse.json({ playlists });
  } catch (err) {
    return NextResponse.json({
      playlists: [],
      error: err instanceof Error ? err.message : "Falha ao listar playlists.",
    });
  }
}
