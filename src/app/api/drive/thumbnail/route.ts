import { NextResponse, type NextRequest } from "next/server";
import { driveRefSchema } from "@/lib/drive/contracts";
import { fetchDriveThumbnail } from "@/lib/drive/googleDrive";

/** How long the window may reuse a thumbnail: about as long as Drive's own link lasts. */
const THUMBNAIL_MAX_AGE_S = 3600;

/** A Drive file's thumbnail, by the id a folder listing gave it. A 404 makes the tile show the
 * file's icon instead. */
export async function GET(request: NextRequest) {
  const id = driveRefSchema.shape.id.safeParse(request.nextUrl.searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const thumbnail = await fetchDriveThumbnail(id.data, request.signal);
  if (!thumbnail?.body) return new NextResponse(null, { status: 404 });

  return new NextResponse(thumbnail.body, {
    headers: {
      "Content-Type": thumbnail.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": `private, max-age=${THUMBNAIL_MAX_AGE_S}`,
    },
  });
}
