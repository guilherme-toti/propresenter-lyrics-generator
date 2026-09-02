import { NextResponse } from "next/server";
import { z } from "zod";
import { scanPlaylistFolder } from "@/lib/propresenter/playlist";

const bodySchema = z.object({ folder: z.string().min(1) });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Pasta inválida." }, { status: 400 });
  }

  const playlists = await scanPlaylistFolder(parsed.data.folder);
  return NextResponse.json({ playlists });
}
