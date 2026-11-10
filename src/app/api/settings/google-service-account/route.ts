import { NextResponse } from "next/server";
import { serviceAccountRequestSchema } from "@/lib/drive/contracts";
import { DriveError } from "@/lib/drive/driveError";
import { saveServiceAccountFrom, serviceAccountEmail } from "@/lib/drive/serviceAccount";

/** The service account the Backgrounds screen opens Drive folders as: only its email ever leaves
 * the server, never the key. */
export async function GET() {
  return NextResponse.json({ email: await serviceAccountEmail() });
}

/** Takes the .json key the user picked, checks it with Google and keeps a copy. */
export async function POST(request: Request) {
  const parsed = serviceAccountRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  try {
    const email = await saveServiceAccountFrom(parsed.data.path, request.signal);
    return NextResponse.json({ email });
  } catch (err) {
    if (err instanceof DriveError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (!request.signal.aborted) console.error("saving the Google service account failed", err);
    return NextResponse.json({ error: "Não foi possível guardar essa conta de serviço." }, { status: 500 });
  }
}
