/** Which artist a song opened from a .pro file gets. Only a type import, so `node --test` can
 * load it. */
import type { DecodedProFile } from "./decode";

/** The CCLI author first, since that's where this app's export writes the artist (see build.ts),
 * so a reopened song saves back with the same one. Then the artist credits, which ProPresenter's
 * CCLI panel fills as "Artist". */
export function artistFromCredits({ author, artistCredits }: Pick<DecodedProFile, "author" | "artistCredits">): string {
  return author || artistCredits;
}
