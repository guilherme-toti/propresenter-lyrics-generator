import { NextResponse } from "next/server";
import { z } from "zod";
import { isDesktopServer } from "@/lib/desktop/envFile";
import { addPresentationToPlaylist } from "@/lib/propresenter/playlist";

const bodySchema = z.object({
  playlistsFolder: z.string().min(1),
  playlistId: z.string().min(1),
  presentationPath: z.string().min(1),
  name: z.string().min(1),
});

/** Desktop-only, best-effort: called right after a successful export to the Library, to also drop
 * the new presentation into the currently selected playlist — see ExportFab. A false `added`
 * (playlist not found, or the file failed to decode/write) isn't a request error; the export
 * itself already succeeded, the caller just falls back to telling the user to drag it in by hand. */
export async function POST(request: Request) {
  if (!isDesktopServer()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const { playlistsFolder, playlistId, presentationPath, name } = parsed.data;
  const added = await addPresentationToPlaylist(playlistsFolder, playlistId, {
    name,
    absolutePath: presentationPath,
  });
  return NextResponse.json({ added });
}
