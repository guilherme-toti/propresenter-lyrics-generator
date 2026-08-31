import { NextResponse } from "next/server";
import { encodeSongAsProFile, proFileName } from "@/lib/propresenter/encode";
import { songSchema } from "@/lib/songSchema";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = songSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Música inválida." }, { status: 400 });
  }

  try {
    const buffer = await encodeSongAsProFile(parsed.data);
    const filename = proFileName(parsed.data);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    console.error("propresenter export failed", error);
    return NextResponse.json({ error: "Falha ao gerar o arquivo do ProPresenter." }, { status: 500 });
  }
}
