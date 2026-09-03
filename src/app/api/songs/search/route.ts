import { NextResponse } from "next/server";
import { z } from "zod";
import { isMusixmatchConfigured, searchTracks } from "@/lib/lyrics/musixmatch";

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

  // Without a key there is no catalogue to pick from; the caller falls back to generating
  // straight from the query, exactly as it did before the picker existed.
  if (!isMusixmatchConfigured()) {
    return NextResponse.json({ configured: false, results: [] });
  }

  try {
    const results = await searchTracks(parsed.data.query);
    return NextResponse.json({ configured: true, results });
  } catch (error) {
    console.error("catalogue search failed", error);
    return NextResponse.json({ error: "Não foi possível buscar no catálogo." }, { status: 502 });
  }
}
