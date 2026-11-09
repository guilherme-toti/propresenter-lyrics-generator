import { NextResponse, type NextRequest } from "next/server";
import { isTrustedDesktopRequest } from "@/lib/desktop/requestGuard";

/** Every API route touches the user's disk, settings, ProPresenter or paid API quota, so all of
 * them answer only the app's own pages. Guarding the whole prefix here means a new route is
 * covered without having to remember to opt in. */
export function proxy(request: NextRequest) {
  if (!isTrustedDesktopRequest(request.headers)) {
    return NextResponse.json({ error: "Pedido bloqueado por segurança." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
