import { NextResponse } from "next/server";
import { readBackgroundsOverview } from "@/lib/propresenter/backgrounds/library";
import { folderRequestSchema } from "@/lib/propresenter/backgrounds/requests";
import { backgroundsErrorResponse, invalidRequestResponse } from "@/lib/propresenter/backgrounds/routeError";

/** Every media file the workspace's macros show, and which macro shows which. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = folderRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequestResponse();

  try {
    return NextResponse.json(await readBackgroundsOverview(parsed.data.folder));
  } catch (err) {
    return backgroundsErrorResponse(err, "list", "Não foi possível ler as macros do ProPresenter.");
  }
}
