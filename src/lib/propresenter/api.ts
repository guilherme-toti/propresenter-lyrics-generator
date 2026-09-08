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
