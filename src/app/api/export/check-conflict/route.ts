import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { isDesktopServer } from "@/lib/desktop/envFile";
import { listLibraryDirs, type ExportConflict } from "@/lib/propresenter/libraries";
import { sanitizeFileBaseName } from "@/lib/propresenter/encode";

const requestSchema = z.object({
  libraryFolder: z.string().min(1),
  name: z.string().min(1),
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

  const { libraryFolder, name } = parsed.data;
  const fileName = `${sanitizeFileBaseName(name)}.pro`;

  const dirs = await listLibraryDirs(libraryFolder);
  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir.path, { withFileTypes: true });
      const match = entries.find((entry) => entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase());
      if (match) {
        const conflict: ExportConflict = { library: dir.name, path: path.join(dir.path, match.name) };
        return NextResponse.json({ conflict });
      }
    } catch {
      // One library folder unreadable (permissions, etc.) shouldn't sink the whole check.
    }
  }

  return NextResponse.json({ conflict: null });
}
