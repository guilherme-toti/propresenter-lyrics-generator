import { NextResponse } from "next/server";
import { BackgroundsError } from "./fileSwap";

/** The same answer shape for every /api/backgrounds route: a problem the user can fix comes back
 * with its own message, anything else is logged and reported plainly. */
export function backgroundsErrorResponse(err: unknown, route: string, fallbackMessage: string): NextResponse {
  if (err instanceof BackgroundsError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(`backgrounds/${route} failed`, err);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

export function invalidRequestResponse(): NextResponse {
  return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
}
