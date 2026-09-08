/**
 * Client for ProPresenter's local HTTP API (ProPresenter 21.x, `api_version: v1`),
 * used to add an exported presentation to a playlist.
 *
 * Why this exists at all rather than editing the playlist file: ProPresenter reads
 * playlist documents into memory at launch and never re-reads them while running, so
 * a correct file write is invisible until restart and can be overwritten by
 * ProPresenter's own next save. See the design doc for the evidence.
 *
 * ProPresenter serves its own OpenAPI document at /v1/doc/swagger.json. It is wrong
 * in ways that matter here — the deviations are called out at each site below.
 */

export interface PresentationInfo {
  presentation_uuid: string;
  arrangement_name?: string;
  arrangement_uuid?: string;
}

/** One item as returned by `GET /v1/playlist/{id}`. */
export interface PlaylistApiItem {
  id: { uuid: string; name: string; index: number };
  type: string;
  is_hidden?: boolean;
  is_pco?: boolean;
  header_color?: unknown;
  presentation_info?: PresentationInfo | null;
}

/**
 * Maps one item from the shape `GET` returns into the shape `PUT` accepts. They are
 * not the same shape: `PUT` requires `target_uuid`, which `GET` never sends.
 *
 * `index` is passed in rather than read from the item because a `PUT` rewrites the
 * whole list and positions must be contiguous.
 */
export function toPutItem(item: PlaylistApiItem, index: number): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: { ...item.id, index },
    type: item.type,
    is_hidden: item.is_hidden ?? false,
    is_pco: item.is_pco ?? false,
    // Declared `nullable` in ProPresenter's OpenAPI document, but its deserializer
    // rejects null outright: "invalid type: null, expected a string". Headers and
    // placeholders have no target object, so they take an empty string.
    target_uuid: item.presentation_info?.presentation_uuid ?? "",
  };
  // Only sent when present — a null header_color on a non-header is rejected the
  // same way target_uuid's null is.
  if (item.header_color != null) out.header_color = item.header_color;
  if (item.presentation_info != null) out.presentation_info = item.presentation_info;
  return out;
}

/** A brand-new playlist entry pointing at a presentation already indexed in a library. */
export function presentationItem(
  presentationUuid: string,
  name: string,
  index: number,
): Record<string, unknown> {
  return {
    id: { uuid: presentationUuid, name, index },
    type: "presentation",
    is_hidden: false,
    is_pco: false,
    target_uuid: presentationUuid,
    presentation_info: {
      presentation_uuid: presentationUuid,
      arrangement_name: "",
      arrangement_uuid: "",
    },
  };
}

/**
 * Library names come from the filesystem, where macOS stores accented characters
 * decomposed (NFD); a name built in JavaScript is composed (NFC). "É Ele" from the
 * API and "É Ele" from an export are different strings until both are normalised.
 */
export function namesMatch(a: string, b: string): boolean {
  return a.normalize("NFC") === b.normalize("NFC");
}

/** Loopback only: ProPresenter runs on the same machine as this app. */
function baseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

const REQUEST_TIMEOUT_MS = 5_000;
/** ProPresenter indexed a freshly written .pro in ~4s during testing; 15s is headroom. */
const INDEX_TIMEOUT_MS = 15_000;
const INDEX_POLL_INTERVAL_MS = 500;

async function apiRequest(port: number, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl(port)}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(
      "Não foi possível falar com o ProPresenter. Verifique se ele está aberto e se a rede está ativada nas preferências.",
    );
  }
  if (!res.ok) {
    throw new Error(`O ProPresenter respondeu ${res.status} em ${path}.`);
  }
  return res;
}

/** Backs the "Testar conexão" button — `/version` is the cheapest proof of life. */
export async function pingProPresenter(
  port: number,
): Promise<{ name: string; hostDescription: string }> {
  const res = await apiRequest(port, "/version");
  const data = (await res.json()) as { name?: string; host_description?: string };
  return {
    name: data.name ?? "desconhecido",
    hostDescription: data.host_description ?? "ProPresenter",
  };
}

/**
 * Finds a just-exported presentation's UUID by the name it has in a library, polling
 * because ProPresenter indexes a newly written .pro asynchronously — about 4 seconds
 * in testing. Returns null if it never shows up within INDEX_TIMEOUT_MS.
 *
 * `name` is the exported filename without its .pro extension, which is exactly what
 * ProPresenter uses as the library item's name.
 */
export async function findLibraryPresentation(port: number, name: string): Promise<string | null> {
  const deadline = Date.now() + INDEX_TIMEOUT_MS;

  do {
    const librariesRes = await apiRequest(port, "/v1/libraries");
    const libraries = (await librariesRes.json()) as Array<{ uuid: string }>;

    for (const library of libraries) {
      const itemsRes = await apiRequest(port, `/v1/library/${library.uuid}`);
      const body = (await itemsRes.json()) as { items?: Array<{ uuid: string; name: string }> };
      const match = body.items?.find((item) => namesMatch(item.name, name));
      if (match) return match.uuid;
    }

    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, INDEX_POLL_INTERVAL_MS));
  } while (Date.now() < deadline);

  return null;
}

/**
 * Appends a presentation to a playlist.
 *
 * `PUT /v1/playlist/{id}` *sets* the playlist's contents — there is no append
 * endpoint — so this reads the current items, maps them into PUT shape, adds ours,
 * and writes the whole array back. Two consequences worth knowing:
 *
 *  - ProPresenter mints new `id.uuid` values for every item on each write. Names,
 *    types, header colours and presentation targets survive; item identities do not.
 *  - A playlist edit made in ProPresenter between the GET and the PUT is lost. The
 *    window is milliseconds and the same person drives both apps, so this is accepted.
 */
export async function appendToPlaylist(
  port: number,
  playlistId: string,
  presentationUuid: string,
  name: string,
): Promise<void> {
  const res = await apiRequest(port, `/v1/playlist/${playlistId}`);
  const playlist = (await res.json()) as { items?: PlaylistApiItem[] };
  const existing = playlist.items ?? [];

  const body = [
    ...existing.map((item, index) => toPutItem(item, index)),
    presentationItem(presentationUuid, name, existing.length),
  ];

  await apiRequest(port, `/v1/playlist/${playlistId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
