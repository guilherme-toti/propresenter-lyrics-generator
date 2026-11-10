import { NextResponse } from "next/server";
import { z } from "zod";
import { loadDesktopEnv } from "@/lib/desktop/envFile";
import { isMusixmatchConfigured, MusixmatchError, searchTracks } from "@/lib/lyrics/musixmatch";

const requestSchema = z.object({
  query: z.string().trim().min(2, "Digite o título de uma música ou um trecho da letra."),
});

/**
 * Catalogue search behind the song picker: the user chooses the exact recording rather than
 * anything guessing for them. Three recordings can share a title, and the highest-ranked one
 * isn't always the one whose lyrics are available, so this is a choice worth putting to a human.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requisição inválida." }, { status: 400 });
  }

  // Ajustes shows the key in the .env file, but this process read that file only at boot: a key
  // written there afterwards by anything but Ajustes' own save would sit unused until a restart,
  // while Ajustes shows it saved. Every catalogue flow starts with a search, so catching up here
  // is enough.
  if (!isMusixmatchConfigured()) await loadDesktopEnv();

  try {
    const results = await searchTracks(parsed.data.query);
    return NextResponse.json({ results });
  } catch (error) {
    // An empty list would read as "nothing found", so a search that couldn't run says why.
    if (error instanceof MusixmatchError) {
      return NextResponse.json({ error: error.message }, { status: error.code === "not-configured" ? 501 : 502 });
    }
    console.error("catalogue search failed", error);
    return NextResponse.json({ error: "Não foi possível buscar no catálogo." }, { status: 502 });
  }
}
