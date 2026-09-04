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
  const attributions = [song.attributionA, song.attributionB].filter((a): a is NonNullable<typeof a> => Boolean(a));
  if (attributions.length === 0) return null;

  const copyrights = [...new Set(attributions.map((a) => a.copyright).filter(Boolean))];

  return (
    <footer className="flex flex-col gap-1 border-t border-line pt-3 text-[13px] text-ink/45">
      {copyrights.map((copyright) => (
        <p key={copyright}>{copyright}</p>
      ))}
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
      {attributions.map(
        (a) =>
          a.trackingUrl && (
            // A counted view, not an image: next/image would rewrite the URL through the optimizer
            // and the request would never reach Musixmatch as the view it is meant to record. Not
            // display:none either — a hidden image isn't guaranteed to be fetched, and an unfetched
            // pixel is an uncounted view. Each side's own pixel fires once per fetch, so both are
            // rendered even when they happen to share the same copyright text above.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={a.trackingUrl} src={a.trackingUrl} alt="" width={1} height={1} aria-hidden className="opacity-0" />
          ),
      )}
    </footer>
  );
}
