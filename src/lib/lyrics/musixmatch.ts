/**
 * Musixmatch is the *source of truth* for lyrics: a licensed database, looked up by title and
 * artist, replacing "ask a model to remember the words". The model still identifies which song
 * is meant and aligns two language versions against each other — the fuzzy work it's good at —
 * but it no longer authors any lyric text when Musixmatch has the song.
 *
 * Using the API carries obligations (docs.musixmatch.com/lyrics-views-tracking): wherever the
 * lyrics are shown, the returned `lyrics_copyright` must be visible and one of the tracking
 * URLs must fire. Both travel with the lyrics through `MusixmatchLyrics` so the UI can honour
 * them — see MusixmatchAttribution.
 */

const API_BASE = "https://api.musixmatch.com/ws/1.1";
const REQUEST_TIMEOUT_MS = 10_000;

export interface MusixmatchLyrics {
  text: string;
  /** Must be displayed wherever these lyrics are. */
  copyright: string;
  /** Must be requested wherever these lyrics are displayed, to count the view. */
  trackingPixelUrl: string;
}

export function isMusixmatchConfigured(): boolean {
  return Boolean(process.env.MUSIXMATCH_API_KEY);
}

/**
 * Musixmatch answers 200 at the HTTP level and puts the real status inside the envelope, so
 * "not found" (404) and "over quota" (402) both arrive as successful responses.
 */
interface MusixmatchEnvelope {
  message?: {
    header?: { status_code?: number };
    body?: {
      lyrics?: {
        lyrics_body?: string;
        lyrics_copyright?: string;
        pixel_tracking_url?: string;
        restricted?: number;
      };
    };
  };
}

/**
 * The free/older API appends this to a truncated body. It isn't part of the song, and isn't the
 * copyright notice either — that's `lyrics_copyright`, which is displayed separately and intact.
 */
function stripNonLyricFooter(body: string): string {
  return body
    .replace(/\*{3,}[^]*?commercial use[^]*?\*{3,}/gi, "")
    .replace(/\(\d+\)\s*$/, "")
    .trim();
}

/**
 * Looks up one recording's lyrics. Returns null whenever the song can't be used — no key
 * configured, no match, restricted content, quota exhausted, network trouble — so every caller
 * can simply fall back to asking the model.
 */
export async function fetchLyrics(title: string, artist: string): Promise<MusixmatchLyrics | null> {
  const apiKey = process.env.MUSIXMATCH_API_KEY;
  if (!apiKey || !title.trim()) return null;

  const url = new URL(`${API_BASE}/matcher.lyrics.get`);
  url.searchParams.set("q_track", title);
  if (artist.trim()) url.searchParams.set("q_artist", artist);
  url.searchParams.set("apikey", apiKey);

  let payload: MusixmatchEnvelope;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) {
      console.error(`musixmatch responded ${res.status} for ${title} — ${artist}`);
      return null;
    }
    payload = (await res.json()) as MusixmatchEnvelope;
  } catch (error) {
    console.error("musixmatch request failed", error);
    return null;
  }

  const status = payload.message?.header?.status_code;
  if (status !== 200) {
    // 404 is an ordinary miss; the rest are worth seeing in the logs (401 bad key, 402 quota,
    // 403 disabled key) because they need action rather than a fallback.
    if (status !== 404) console.error(`musixmatch status ${status} for ${title} — ${artist}`);
    return null;
  }

  const lyrics = payload.message?.body?.lyrics;
  const text = stripNonLyricFooter(lyrics?.lyrics_body ?? "");
  // Restricted tracks come back successful but empty: "not authorized to show these lyrics".
  if (!text || lyrics?.restricted) return null;

  return {
    text,
    copyright: lyrics?.lyrics_copyright?.trim() ?? "",
    trackingPixelUrl: lyrics?.pixel_tracking_url ?? "",
  };
}

/**
 * Musixmatch returns a plain lyric body: lines separated by newlines, sections by blank lines,
 * with no section names. Labels are left generic here and named properly later by the model,
 * which sees both language versions and can tell a chorus from a verse.
 */
export function splitIntoSections(text: string): { label: string; lines: string[] }[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines, index) => ({ label: `Parte ${index + 1}`, lines }));
}
