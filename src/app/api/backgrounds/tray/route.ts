import { NextResponse } from "next/server";
import { addTrayFilesRequestSchema } from "@/lib/propresenter/backgrounds/requests";
import { backgroundsErrorResponse, invalidRequestResponse } from "@/lib/propresenter/backgrounds/routeError";
import { addTrayFiles } from "@/lib/propresenter/backgrounds/tray";

/** Files the user dropped or picked, each given an id its preview can be fetched by. Files that
 * can't go on a screen come back with the reason instead. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = addTrayFilesRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequestResponse();

  try {
    return NextResponse.json(await addTrayFiles(parsed.data.paths));
  } catch (err) {
    return backgroundsErrorResponse(err, "tray", "Não foi possível abrir esses arquivos.");
  }
}
