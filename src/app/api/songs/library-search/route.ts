import { NextResponse } from "next/server";
import { z } from "zod";
import { searchLibrary } from "@/lib/propresenter/librarySearch";
import type { ImportableFilesReply } from "@/lib/songSchema";

const requestSchema = z.object({
  libraryFolder: z.string().min(1),
  query: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  try {
    const files = await searchLibrary(parsed.data.libraryFolder, parsed.data.query);
    return NextResponse.json({ files } satisfies ImportableFilesReply);
  } catch (err) {
    console.error("library-search: searching library folders failed", err);
    return NextResponse.json({ error: "Não foi possível ler a pasta da Library." }, { status: 500 });
  }
}
