import { NextResponse } from "next/server";
import { z } from "zod";
import { portSchema } from "@/lib/desktop/parsePort";
import { appendToPlaylist, findLibraryPresentation, proPresenterFailureMessage } from "@/lib/propresenter/api";

const bodySchema = z.object({
  port: portSchema,
  playlistId: z.string().min(1),
  /** The exported filename without ".pro" — what ProPresenter names the library item. */
  presentationName: z.string().min(1),
});

/** Called right after a successful export to the Library, to also add the new
 * presentation to the selected playlist via ProPresenter's HTTP API.
 *
 * A false `added` is not a request error: the export itself already succeeded and the file is
 * safely in the Library. The caller surfaces `reason` to the user rather than failing the export.
 * There is deliberately no file-writing fallback — writing the playlist document behind a running
 * ProPresenter is invisible until restart and gets overwritten by its next save, which is the bug
 * this route exists to fix. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const { port, playlistId, presentationName } = parsed.data;

  try {
    const presentationUuid = await findLibraryPresentation(port, presentationName);
    if (!presentationUuid) {
      return NextResponse.json({
        added: false,
        reason: "O ProPresenter ainda não indexou a apresentação na biblioteca.",
      });
    }

    await appendToPlaylist(port, playlistId, presentationUuid, presentationName);
    return NextResponse.json({ added: true });
  } catch (err) {
    return NextResponse.json({
      added: false,
      reason: proPresenterFailureMessage(err, "playlists/add-item", "Tente de novo."),
    });
  }
}
