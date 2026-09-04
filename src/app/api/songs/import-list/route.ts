import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { isDesktopServer } from "@/lib/desktop/envFile";

const requestSchema = z.object({
  libraryFolder: z.string().min(1),
});

export interface ImportableFile {
  library: string;
  filename: string;
  path: string;
}

async function listProFiles(folder: string, libraryLabel: string): Promise<ImportableFile[]> {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pro"))
    .map((entry) => ({ library: libraryLabel, filename: entry.name, path: path.join(folder, entry.name) }));
}

export async function POST(request: Request) {
  if (!isDesktopServer()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const { libraryFolder } = parsed.data;
  const librariesParent = path.dirname(libraryFolder);

  try {
    const siblingEntries = await fs.readdir(librariesParent, { withFileTypes: true });
    const libraryDirs = siblingEntries.filter((entry) => entry.isDirectory());

    const files: ImportableFile[] = [];
    for (const dir of libraryDirs) {
      const libraryPath = path.join(librariesParent, dir.name);
      try {
        files.push(...(await listProFiles(libraryPath, dir.name)));
      } catch {
        // One sibling library folder unreadable (permissions, etc.) shouldn't sink the whole listing.
      }
    }
    files.sort((a, b) => a.filename.localeCompare(b.filename, "pt-BR"));
    return NextResponse.json({ files });
  } catch (err) {
    console.error("import-list: parent traversal failed, falling back to the selected library only", err);
    try {
      const files = (await listProFiles(libraryFolder, path.basename(libraryFolder))).sort((a, b) =>
        a.filename.localeCompare(b.filename, "pt-BR"),
      );
      return NextResponse.json({ files });
    } catch (fallbackErr) {
      console.error("import-list: fallback to selected library also failed", fallbackErr);
      return NextResponse.json({ error: "Não foi possível ler a pasta da Library." }, { status: 500 });
    }
  }
}
