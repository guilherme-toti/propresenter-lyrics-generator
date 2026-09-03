"use client";

import type { Song } from "@/lib/types";

/**
 * Musixmatch's terms require, wherever their lyrics are displayed, that the copyright notice is
 * clearly visible and that the view is counted — the docs allow an image pixel when a script tag
 * isn't practical, which is the case inside a React tree
 * (docs.musixmatch.com/lyrics-views-tracking). Rendering this next to the lyrics is what keeps
 * the integration within terms, so it is not decorative: don't drop it to tidy the layout.
 */
export function MusixmatchAttribution({ song }: { song: Song }) {
  const attribution = song.lyricsAttribution;
  if (!attribution) return null;

  return (
    <footer className="flex flex-col gap-1 border-t border-line pt-3 text-[13px] text-ink/45">
      {attribution.copyright && <p>{attribution.copyright}</p>}
      <p>
        Letras por{" "}
        <a
          href="https://www.musixmatch.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-ink/70"
        >
          Musixmatch
        </a>
      </p>
      {attribution.trackingUrls.map((url) => (
        // A counted view, not an image: next/image would rewrite the URL through the optimizer
        // and the request would never reach Musixmatch as the view it is meant to record. Not
        // display:none either — a hidden image isn't guaranteed to be fetched, and an unfetched
        // pixel is an uncounted view.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={url} src={url} alt="" width={1} height={1} aria-hidden className="opacity-0" />
      ))}
    </footer>
  );
}
