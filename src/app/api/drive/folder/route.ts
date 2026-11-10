import { NextResponse } from "next/server";
import { driveFolderRequestSchema, type DriveFolderReply } from "@/lib/drive/contracts";
import { DriveError } from "@/lib/drive/driveError";
import { openDriveFolder } from "@/lib/drive/googleDrive";

/** A Drive folder's name and contents, for the Backgrounds screen's Drive browser. */
export async function POST(request: Request) {
  const parsed = driveFolderRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  try {
    const reply: DriveFolderReply = await openDriveFolder(parsed.data.folder, request.signal);
    return NextResponse.json(reply);
  } catch (err) {
    if (err instanceof DriveError) return NextResponse.json({ error: err.message }, { status: err.status });
    // The window cancels a listing it no longer needs (another folder opened, the browser closed).
    if (!request.signal.aborted) console.error("drive/folder failed", err);
    return NextResponse.json({ error: "Não foi possível abrir essa pasta do Google Drive." }, { status: 500 });
  }
}
