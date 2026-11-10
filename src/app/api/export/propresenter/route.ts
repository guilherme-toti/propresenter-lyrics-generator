import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { encodeSongAsProFile, proFileName, sanitizeFileBaseName } from "@/lib/propresenter/encode";
import { writeUniqueFile } from "@/lib/exportToFolder";
import { isPathInside } from "@/lib/propresenter/libraries";
import { songSchema } from "@/lib/songSchema";

const bodySchema = z.object({
  song: songSchema,
  // The ProPresenter Library folder chosen in Ajustes: the .pro is written straight into it. The
  // app is desktop-only and asks for the folder before exporting, so there's no download fallback.
  destinationFolder: z.string().min(1),
  // User-chosen name from ExportOverwriteModal (see /api/export/check-conflict) — overrides the
  // filename that'd otherwise be derived from song.title. Base name only, no ".pro".
  fileName: z.string().min(1).optional(),
  // Set when the user confirmed overwriting an existing file found by check-conflict — that file
  // may live in a different library than destinationFolder (see ExportOverwriteModal), so this is
  // the exact path to replace instead of writing a new, uniquely-named one.
  overwritePath: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Música inválida." }, { status: 400 });
  }

  const { song, destinationFolder, fileName, overwritePath } = parsed.data;

  try {
    const buffer = await encodeSongAsProFile(song);
    const filename = fileName ? `${sanitizeFileBaseName(fileName)}.pro` : proFileName(song);

    if (overwritePath) {
      // overwritePath comes from a prior check-conflict response, but it's still client-supplied —
      // never write outside the Libraries folder tree it was found in.
      const librariesParent = path.dirname(destinationFolder);
      const resolvedOverwrite = path.resolve(overwritePath);
      if (!isPathInside(librariesParent, resolvedOverwrite)) {
        return NextResponse.json({ error: "Caminho de destino inválido." }, { status: 400 });
      }
      await fs.writeFile(resolvedOverwrite, buffer);
      return NextResponse.json({ savedTo: resolvedOverwrite });
    }

    const savedTo = await writeUniqueFile(destinationFolder, filename, buffer);
    return NextResponse.json({ savedTo });
  } catch (error) {
    console.error("propresenter export failed", error);
    return NextResponse.json(
      { error: "Não deu pra salvar na pasta da Library. Confira em Ajustes se ela ainda existe e tente de novo." },
      { status: 500 },
    );
  }
}
