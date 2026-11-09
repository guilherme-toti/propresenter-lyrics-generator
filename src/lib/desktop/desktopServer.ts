import { NextResponse } from "next/server";
import { isTrustedDesktopRequest } from "./requestGuard";

/** Only ever set by the Tauri sidecar/dev process (see src-tauri/src/lib.rs and the
 * `tauri:dev:next` script) — a plain web deploy never sets this, so routes gated on
 * it 404 there instead of letting any visitor rewrite the shared deployment's env. */
export function isDesktopServer(): boolean {
  return process.env.PMA_DESKTOP_APP === "1";
}

/** For anything that touches the user's disk, settings or ProPresenter: it doesn't exist on
 * the web, and on the desktop it only answers the app's own pages. Returns the response to
 * send back, or null when the route may proceed. */
export function rejectDesktopOnlyRequest(request: Request): NextResponse | null {
  if (!isDesktopServer()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!isTrustedDesktopRequest(request.headers)) {
    return NextResponse.json({ error: "Pedido bloqueado por segurança." }, { status: 403 });
  }
  return null;
}
