import { NextResponse } from "next/server";
import { z } from "zod";
import { encodeSongAsProFile, proFileName } from "@/lib/propresenter/encode";
import { writeUniqueFile } from "@/lib/exportToFolder";
import { songSchema } from "@/lib/songSchema";

const bodySchema = z.object({
  song: songSchema,
  // Set only by the desktop app: when present, the .pro is written straight into
  // this folder (a ProPresenter Library folder) instead of being returned for download.
  destinationFolder: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Música inválida." }, { status: 400 });
  }

  const { song, destinationFolder } = parsed.data;

  try {
    const buffer = await encodeSongAsProFile(song);
    const filename = proFileName(song);

    if (destinationFolder) {
      const savedTo = await writeUniqueFile(destinationFolder, filename, buffer);
      return NextResponse.json({ savedTo });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    console.error("propresenter export failed", error);
    const message = destinationFolder
      ? "Falha ao salvar o arquivo na pasta escolhida."
      : "Falha ao gerar o arquivo do ProPresenter.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
