/** The desktop server listens on loopback, which any website open in the same machine's
 * browser can reach. A cross-site `text/plain` POST is a CORS "simple request": the browser
 * sends it without a preflight, so the route would act on it even though the page can't read
 * the reply. The app's own pages only ever send same-origin JSON, so anything else is refused. */
export function isTrustedDesktopRequest(headers: Headers): boolean {
  return isLoopbackHost(headers) && isSameOrigin(headers) && isNotFromAnotherSite(headers) && hasJsonBodyOrNone(headers);
}

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** DNS rebinding: a hostile page can point its own domain at 127.0.0.1, and then its Origin and
 * Host match each other. The server only listens on loopback, so a real request always names a
 * loopback host. */
function isLoopbackHost(headers: Headers): boolean {
  const host = headers.get("host");
  if (!host) return false;
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  // Browsers attach Origin to every cross-origin request and every POST. Without one the
  // caller is a local tool (curl, a script), which can already reach loopback directly.
  if (origin === null) return true;

  const host = headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host.toLowerCase();
  } catch {
    // "null" (sandboxed iframes, file:// pages, no-referrer redirects) proves nothing.
    return false;
  }
}

/** An <img> or <video> on another website sends no Origin, so isSameOrigin lets it through, and
 * the server listens on a fixed port any page can name. Browsers that send Fetch Metadata say where
 * a request came from: only the app's own pages ("same-origin") and a URL typed by the user
 * ("none") are let in. Without the header (curl, older webviews) the other checks still apply. */
function isNotFromAnotherSite(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}

function hasJsonBodyOrNone(headers: Headers): boolean {
  const contentLength = headers.get("content-length");
  const hasBody = headers.has("transfer-encoding") || (contentLength !== null && contentLength.trim() !== "0");
  if (!hasBody) return true;

  const mediaType = headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  // Not a CORS-safelisted type, so a cross-site page can only send it after a preflight,
  // which this server never answers with Access-Control-Allow-Origin.
  return mediaType === "application/json";
}
