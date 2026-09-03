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

/** How many catalogue matches to offer the model to choose between. */
const SEARCH_PAGE_SIZE = 5;

export interface TrackCandidate {
  commontrackId: number;
  title: string;
  artist: string;
  /** Two-letter code from the catalogue ("pt", "en"), or empty when it isn't tagged. */
  language: string;
}

interface SearchEnvelope {
  message?: {
    header?: { status_code?: number };
    body?: {
      track_list?: {
        track?: {
          commontrack_id?: number;
          track_name?: string;
          artist_name?: string;
          has_lyrics?: number;
          lyrics_language?: string;
        };
      }[];
    };
  };
}

async function request<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const apiKey = process.env.MUSIXMATCH_API_KEY;
  if (!apiKey) return null;

  const url = new URL(`${API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("apikey", apiKey);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) {
      console.error(`musixmatch ${path} responded ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (error) {
    console.error(`musixmatch ${path} request failed`, error);
    return null;
  }
}

/**
 * Finds real songs from the user's raw query. `q` searches titles, artists *and* lyrics at once,
 * which is exactly the shape of what the app asks for ("a title, a lyric snippet, or a short
 * description") — so a half-remembered line finds the song without anyone having to know its
 * name. This is what lets a song the model has never heard of still be found: the catalogue
 * answers "does this exist", and the model is left to choose among things that really do.
 */
export async function searchTracks(query: string): Promise<TrackCandidate[]> {
  if (!query.trim()) return [];

  // Both searches, always, because each one fails badly at the other's job and the app can't
  // know which kind of thing was typed. Measured against this catalogue: the snippet "estou
  // preparando um caminho endireitando as veredas" returns, under `q`, songs merely *titled*
  // "Estou Te Preparando" — and under `q_lyrics`, the three recordings of the song that line
  // actually opens. A title behaves the other way round.
  const [byTitle, byLyrics] = await Promise.all([
    searchWith({ q: query }),
    searchWith({ q_lyrics: query }),
  ]);

  // Interleaved rather than concatenated: whichever search understood the query has its best
  // result at the top either way, instead of the wrong one owning the whole first page.
  const merged: TrackCandidate[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < Math.max(byLyrics.length, byTitle.length); i += 1) {
    for (const candidate of [byLyrics[i], byTitle[i]]) {
      if (candidate && !seen.has(candidate.commontrackId)) {
        seen.add(candidate.commontrackId);
        merged.push(candidate);
      }
    }
  }
  return merged;
}

async function searchWith(params: Record<string, string>): Promise<TrackCandidate[]> {
  const payload = await request<SearchEnvelope>("track.search", {
    ...params,
    f_has_lyrics: "1",
    // No s_track_rating here on purpose: it's documented as sorting the whole result set by
    // popularity, not as a relevance tiebreaker — it replaces relevance ordering rather than
    // refining it. With it set, searching "oceans hillsong" returned unrelated but broadly
    // popular tracks (a generic pop song, a random rock track, "God Bless America") instead of
    // Hillsong UNITED's "Oceans" — the query was clearly still matching loosely underneath, but
    // popularity was deciding the order shown. Omitting it leaves the API's default relevance
    // ranking in charge, which is what the search actually needs to be useful.
    page_size: String(SEARCH_PAGE_SIZE),
  });
  if (payload?.message?.header?.status_code !== 200) return [];

  return (payload.message.body?.track_list ?? [])
    .map((entry) => entry.track)
    .filter((track) => track?.commontrack_id && track.track_name)
    .map((track) => ({
      commontrackId: track!.commontrack_id!,
      title: track!.track_name!,
      artist: track!.artist_name ?? "",
      language: track!.lyrics_language ?? "",
    }));
}

/**
 * Walks the candidates until one actually yields lyrics.
 *
 * Rank says nothing about availability: searching that same snippet, the top hit was a version
 * of the right song whose lyrics are withheld ("Unfortunately we're not authorized to show
 * these lyrics") while the third was complete. Giving up on the first restricted track would
 * throw away a song the catalogue does have.
 */
export async function fetchFirstAvailable(
  candidates: TrackCandidate[],
): Promise<{ lyrics: MusixmatchLyrics; track: TrackCandidate } | null> {
  for (const track of candidates) {
    const lyrics = await fetchLyricsByTrackId(track.commontrackId);
    if (lyrics) return { lyrics, track };
  }
  return null;
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
  if (!title.trim()) return null;
  const payload = await request<MusixmatchEnvelope>("matcher.lyrics.get", {
    q_track: title,
    ...(artist.trim() ? { q_artist: artist } : {}),
  });
  return readLyrics(payload, `${title} — ${artist}`);
}

/**
 * Exact lookup for a track already chosen from search results — no fuzzy title matching to get
 * wrong a second time.
 */
export async function fetchLyricsByTrackId(commontrackId: number): Promise<MusixmatchLyrics | null> {
  const payload = await request<MusixmatchEnvelope>("track.lyrics.get", {
    commontrack_id: String(commontrackId),
  });
  return readLyrics(payload, `commontrack ${commontrackId}`);
}

function readLyrics(payload: MusixmatchEnvelope | null, label: string): MusixmatchLyrics | null {
  if (!payload) return null;

  const status = payload.message?.header?.status_code;
  if (status !== 200) {
    // 404 is an ordinary miss; the rest are worth seeing in the logs (401 bad key, 402 quota,
    // 403 disabled key) because they need action rather than a fallback.
    if (status !== 404) console.error(`musixmatch status ${status} for ${label}`);
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
