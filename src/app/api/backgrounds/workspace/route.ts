import { NextResponse } from "next/server";
import type { DetectedFolderReply } from "@/lib/propresenter/backgrounds/contracts";
import { folderRequestSchema } from "@/lib/propresenter/backgrounds/requests";
import { invalidRequestResponse } from "@/lib/propresenter/backgrounds/routeError";
import {
  NOT_A_WORKSPACE_MESSAGE,
  detectWorkspaceFolder,
  isWorkspaceFolder,
} from "@/lib/propresenter/backgrounds/workspace";

/** Prefills "Pasta do ProPresenter". Finding nothing is an answer (`folder: null`), not a failure:
 * the user just picks the folder by hand. */
export async function GET() {
  return NextResponse.json({ folder: await detectWorkspaceFolder() } satisfies DetectedFolderReply);
}

/** Checks a folder the user picked before it's saved. Like /api/propresenter/ping, a folder that
 * doesn't qualify is a result to show (200 with `ok: false`), not a request error. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = folderRequestSchema.safeParse(body);
  if (!parsed.success) return invalidRequestResponse();

  const ok = await isWorkspaceFolder(parsed.data.folder);
  return NextResponse.json(ok ? { ok: true } : { ok: false, error: NOT_A_WORKSPACE_MESSAGE });
}
