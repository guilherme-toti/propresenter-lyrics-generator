import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import { isDesktopServer } from "@/lib/desktop/envFile";
import { importSongFromProFile } from "@/lib/propresenter/importSong";
import { createEmptySong } from "@/lib/types";

const requestSchema = z.object({
  path: z.string().min(1),
});

export async function POST(request: Request) {
  if (!isDesktopServer()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  try {
    const buffer = await fs.readFile(parsed.data.path);
    const imported = await importSongFromProFile(buffer);
    const song = createEmptySong({
      title: imported.title,
      mode: "manual",
      languageA: imported.languageA,
      languageB: imported.languageB,
      alignment: imported.alignment,
    });
    return NextResponse.json({ song });
  } catch (error) {
    console.error("song import failed", error);
    return NextResponse.json(
      { error: "Não foi possível importar esse arquivo. Ele pode estar corrompido ou em um formato inesperado." },
      { status: 500 },
    );
  }
}
