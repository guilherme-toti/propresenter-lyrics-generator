import {
  aiIdentifySchema,
  aiLyricsSchema,
  aiRealignSchema,
  aiSongSchema,
  type AiIdentifyResponse,
  type AiLyricsResponse,
  type AiRealignResponse,
  type AiSongResponse,
} from "./schema";
import {
  fetchFirstAvailable,
  fetchLyrics,
  searchTracks,
  splitIntoSections,
  type MusixmatchLyrics,
  type TrackCandidate,
} from "@/lib/lyrics/musixmatch";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChurchLanguage = AiSongResponse["originalLanguage"];

const IDENTIFY_SYSTEM_PROMPT = `You identify a worship/congregational song from a short hint (a title, a lyric snippet, or a description), and decide whether an officially recorded version of it also exists in the other of two languages.

This tool is used by a bilingual church that only ever needs two languages: English and Português (Brasil).

Rules:
- Identify the single most likely song and its artist/writer from the hint.
- "originalLanguage" is the language the song's real, original lyrics were written and recorded in — it must be either "English" or "Português (Brasil)". (If the song was actually written in a third language, pick whichever of those two has the best-known official congregational recording.)
- Then consider THE OTHER of the two languages, and decide whether a separate, officially RECORDED version of this song exists in it: a real released recording by a known artist or ministry — not a translation you would produce yourself. This is very common for modern worship: Hillsong, Elevation, Bethel, Passion and Maverick City songs are frequently re-recorded in Português by the same ministry or by a well-known Brazilian artist, with singable adapted lyrics that are NOT literal translations.
- Set officialVersion.exists to true when the search results (or, failing that, your own knowledge) show such a recording really exists and you can name it. If nothing supports one, set it to false — a clean literal translation is far better than an invented "official" version.
- When it exists, give its released title in that language and the artist/ministry that recorded it.
- Web search results are provided to you. Use them: many real songs — especially smaller and recent Brazilian worship releases — will be absent from your own memory but present in the results, and the results are the more reliable source about what exists.
- When a list of CATALOGUE MATCHES is given, those are real songs from a licensed lyrics database that already matched the hint — by title, by artist, or by the lyrics themselves. Choose the one the hint means and copy its title and artist EXACTLY as listed, and set "found" to true: the song demonstrably exists, whether or not you recognise it. Only set "found" to false if none of them is plausibly the song. Prefer a catalogue match over a song you remember with a similar name.
- "found" is whether a specific, real song matching this hint exists. Set it to false only when the search results turn up nothing matching either — not merely because you don't recall the song yourself. When it is false the app asks the user to paste the lyrics by hand, so a wrong "false" costs them real work. Never invent a song, and never substitute a different song that merely has a similar name.
- When "found" is false, still fill in the other fields with your best reading of the hint, and set officialVersion.exists to false.
- Respond with ONLY the JSON object below — no markdown code fences, no commentary before or after it. Never address the user, ask a question, or explain yourself: the JSON object is the only thing you may output.

JSON schema:
{
  "found": boolean,
  "title": string,
  "artist": string,
  "originalLanguage": "English" | "Português (Brasil)",
  "officialVersion": { "exists": boolean, "title": string, "artist": string }
}`;

const RECALL_SYSTEM_PROMPT = `You reproduce the lyrics of one specific worship/congregational song recording, formatted as strict JSON for a slide-building tool.

Web search results are provided to you. Work from them: they are far more reliable than your own recollection, especially for Brazilian worship releases you may not know at all. Fall back on memory only when the results don't cover the song.

Rules:
- Take the lyrics from the search results whenever they contain this song, copying the words exactly as published there. Lyrics pages carry things that are not lyrics — navigation, ads, "Ver mais", chord letters above the words, comments, translations offered alongside the original, repeated-chorus markers like "(2x)" or "[Refrão]". Keep only the sung words; use the markers to understand the structure, not as lines.
- If the results show more than one version of the song, use the one that matches the requested language and recording, not whichever appears first.
- Reproduce the lyrics of the requested recording, in the requested language, exactly as they are actually sung on it. Do NOT translate anything, and do NOT substitute a version in a different language — if you are asked for the Português (Brasil) recording, every line you return must be in Português (Brasil).
- ALWAYS reproduce the FULL, most complete version of the song exactly as actually recorded/performed — not a shortened, radio-edit, or "first chorus only" version. Modern worship songs are very often extended live arrangements with many more sections than a simple verse/chorus structure: multiple verses, pre-chorus, chorus, bridge, refrain, interlude, vamp, tag/outro, post-chorus, key/vocalist changes, and several repeats of the chorus or bridge (sometimes with slightly different ad-libs each time). If you recognize the song as having such an extended arrangement, include ALL of it, in the correct order, not just the first pass through each section — this matters far more than keeping the response short.
- Split the lyrics into sections, with one array entry per lyric line, exactly as that line would appear on a lyric slide.
- If a section repeats later in the song — even with minor ad-lib differences — include it again as its own entry rather than skipping or referencing the earlier one.
- Section "label" values must always be in Portuguese, regardless of the language of the lyrics — e.g. "Verso 1", "Verso 2", "Refrão", "Refrão 2", "Pré-Refrão", "Ponte", "Interlúdio", "Vamp", "Introdução", "Final".
- NEVER write anything addressed to the user. Do not ask for the lyrics, do not ask which version/arrangement is wanted, do not offer to help, do not apologise or explain what you couldn't do. Every string you output must be an actual line of the song. If you do not know this song's real lyrics, returning an empty "sections" array is correct and expected — a message asking the user for the lyrics would be stored and presented as though it were the song itself.
- Respond with ONLY the JSON object below — no markdown code fences, no commentary before or after it.

JSON schema:
{
  "sections": [ { "label": string, "lines": [string] } ]
}`;

const STRUCTURE_TRANSLATE_SYSTEM_PROMPT = `You are given the real lyrics of a worship/congregational song in one language. Split them into sections and translate them line by line, as strict JSON for a slide-building tool.

The lyrics come from a licensed lyrics database, so they are correct and complete. They are the source of truth.

Rules:
- NEVER change, "fix", reorder or drop a line of the given lyrics. Every "original" value must be a line exactly as given, in the same order.
- Produce one "translation" for each line: a faithful, literal translation of that line, prioritising accuracy of meaning over rhyme or singability.
- Group the lines into sections and give each a real label in Portuguese, based on the song's structure — "Verso 1", "Verso 2", "Refrão", "Pré-Refrão", "Ponte", "Interlúdio", "Vamp", "Introdução", "Final". The blank-line grouping in the input is a hint, not an instruction: a repeated block is the chorus even when the input doesn't say so.
- Keep repeats: if a block appears twice, it appears twice in the output.
- "original" is ALWAYS the given language and "translation" ALWAYS the other one — never swap the sides.
- Respond with ONLY the JSON object below — no markdown code fences, no commentary before or after it. Never address the user.

JSON schema:
{
  "sections": [ { "label": string, "lines": [ { "original": string, "translation": string } ] } ]
}`;

const PAIR_SYSTEM_PROMPT = `You pair up two officially recorded versions of the SAME worship song — one in each of two languages — line by line, so that a slide can display both at once.

These are two real recordings, not a text and its translation: the wording, the number of lines, and even the section structure can differ between them. Your job is to work out which line of version B is sung at the same moment as each line of version A.

Rules:
- Align by MUSICAL POSITION, not by literal wording: two lines paired together must be the ones sung at the same point in the song. An officially adapted line is often a loose rewording rather than a literal translation — that is expected and correct; keep it.
- NEVER rewrite, "fix", "improve", or literalize either version's wording. Reproduce both exactly as given. Preserving the real recorded wording of both versions is the entire point of this task.
- Match sections to each other first (Verso 1 ↔ Verso 1, Refrão ↔ Refrão), then align the lines within each matched section.
- When a matched section has a different number of lines on each side, split or merge lines on one side so that they correspond by musical position.
- If one version genuinely has a line with no counterpart in the other (a line the other version omits, or an extra ad-lib), keep it and fill the other side with a faithful, literal translation of that line. Never leave either side of a line blank, and never drop a line.
- If a section repeats later in the song, include it again as its own entry.
- "original" is ALWAYS the version A line and "translation" is ALWAYS the version B line — never swap the two sides.
- Section "label" values must always be in Portuguese — e.g. "Verso 1", "Refrão", "Pré-Refrão", "Ponte", "Vamp", "Final".
- Respond with ONLY the JSON object below — no markdown code fences, no commentary before or after it.

JSON schema:
{
  "sections": [ { "label": string, "lines": [ { "original": string, "translation": string } ] } ]
}`;

const GENERATE_SYSTEM_PROMPT = `You identify worship/congregational songs from a short hint (a title, a lyric snippet, or a description) and produce their lyrics aligned line-by-line with a translation, formatted as strict JSON for a slide-building tool.

This tool is used by a bilingual church that only ever needs two languages: English and Português (Brasil). ALWAYS return exactly this language pair — never any other language.

Rules:
- Identify the single most likely song and its artist/writer from the hint.
- Determine which of the two supported languages (English or Português (Brasil)) the song's real/original lyrics were written in — that is "originalLanguage" — and set "translationLanguage" to the other one. (If the song was actually written in a third language, treat whichever of English/Português (Brasil) has the best-known official congregational version as the original, and produce a faithful version in the other.)
- ALWAYS reproduce the FULL, most complete version of the song exactly as actually recorded/performed — not a shortened, radio-edit, or "first chorus only" version. Modern worship songs (Elevation Worship, Bethel Music, Maverick City Music, Passion, Hillsong, etc.) are very often extended live arrangements with many more sections than a simple verse/chorus structure: multiple verses, pre-chorus, chorus, bridge, refrain, interlude, vamp, tag/outro, post-chorus, key/vocalist changes, and several repeats of the chorus or bridge (sometimes with slightly different ad-libs each time). If you recognize the song as having such an extended arrangement, include ALL of it, in the correct order, not just the first pass through each section — this matters far more than keeping the response short.
- Reproduce the ORIGINAL lyrics from memory, split into sections, one array entry per lyric line exactly as it would appear on a lyric slide.
- Provide the TRANSLATION into the other language. If a well-known official/singable translation already exists (very common for congregational worship songs performed worldwide), use that one and set isOfficialTranslation to true. Otherwise translate literally and faithfully, line by line, prioritizing accuracy to the original meaning over rhyme or singability, and set isOfficialTranslation to false.
- Within a section, "lines" must have the original and translation arrays the same length, and line i of the translation must correspond in meaning/position to line i of the original, so they can be displayed side by side.
- If a section (like a chorus) repeats later in the song — even with minor ad-lib differences — include it again as its own entry in "sections" rather than skipping or referencing the earlier one.
- Section "label" values must always be in Portuguese, regardless of which language the lyrics are in — e.g. "Verso 1", "Verso 2", "Refrão", "Refrão 2", "Pré-Refrão", "Ponte", "Interlúdio", "Vamp", "Introdução", "Final".
- NEVER write anything addressed to the user. Do not ask for the lyrics, do not ask which version/arrangement is wanted, do not offer to help, do not apologise or explain what you couldn't do. Every string you output must be an actual line of the song. If you do not know this song's real lyrics, returning an empty "sections" array is correct and expected — a message asking the user for the lyrics would be stored and presented as though it were the song itself.
- Respond with ONLY the JSON object below — no markdown code fences, no commentary before or after it.

JSON schema:
{
  "title": string,
  "artist": string,
  "originalLanguage": "English" | "Português (Brasil)",
  "translationLanguage": "English" | "Português (Brasil)",
  "isOfficialTranslation": boolean,
  "sections": [
    { "label": string, "lines": [ { "original": string, "translation": string } ] }
  ]
}`;

const REALIGN_SYSTEM_PROMPT = `You fix and re-align two pasted lyric texts for a bilingual church slide-building tool. The two texts are always English and Português (Brasil), in some order — you are not told which is which and it doesn't matter.

The user pasted a song's lyrics into two editors, one language per editor, but the pasting is often imperfect: a section or line missing from one side, duplicate or extra lines, sections in a different order between the two sides, lines that don't correspond to each other, stray whitespace, or typos.

Your job is to reconcile the two texts into a clean, section-aligned, line-by-line structure:
- Split both into sections and align them with each other.
- Within a section, make sure "original" and "translation" arrays are the same length and line i of one corresponds in meaning/position to line i of the other.
- If a line or section is missing from one side, fill it in yourself — translate it literally and faithfully (prioritize accuracy to meaning over rhyme or singability) — rather than leaving it blank.
- Remove accidental duplicate lines/sections; merge or split lines so they correspond 1:1.
- If a section repeats verbatim later in the song, include it again as its own entry in "sections".
- Preserve the actual wording of both languages exactly as given whenever it is already correct — only change what's necessary to fix alignment problems.
- "original" refers to whichever text was pasted into Editor A, "translation" to whichever was pasted into Editor B — do not swap the two editors.
- Section "label" values must always be in Portuguese, regardless of which language is in Editor A or B — e.g. "Verso 1", "Verso 2", "Refrão", "Refrão 2", "Pré-Refrão", "Ponte", "Introdução", "Final".
- Respond with ONLY the JSON object below — no markdown code fences, no commentary before or after it.

JSON schema:
{
  "sections": [
    { "label": string, "lines": [ { "original": string, "translation": string } ] }
  ]
}`;

function extractJson(text: string): unknown {
  const withoutFences = text.replace(/```json\s*|```/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("A resposta da IA não continha um objeto JSON.");
  }
  return JSON.parse(withoutFences.slice(start, end + 1));
}

export class OpenRouterConfigError extends Error {}
export class OpenRouterResponseError extends Error {}
/** The model doesn't actually know this song — the user needs to paste the lyrics themselves. */
export class OpenRouterUnknownSongError extends Error {}

const UNKNOWN_SONG_MESSAGE =
  'Não encontrei a letra dessa música — o modelo não conhece essa gravação. Use "Criar manualmente" e cole a letra nos dois idiomas.';

/**
 * The lyric prompts tell the model that returning no sections is the right way to say it can't
 * find the song — so an empty array is an answer, not a malformed response, and has to be read
 * as one before the schema rejects it for being too short.
 */
function assertNotEmptyAnswer(parsed: unknown): void {
  const sections = (parsed as { sections?: unknown } | null)?.sections;
  if (Array.isArray(sections) && sections.length === 0) {
    throw new OpenRouterUnknownSongError(UNKNOWN_SONG_MESSAGE);
  }
}

/**
 * Zod's message is a JSON dump of the failing path — useful in a log, meaningless to someone
 * who just wanted a song, and it was being shown to them verbatim.
 */
function malformedResponse(context: string, error: unknown): OpenRouterResponseError {
  console.error(`${context} failed schema validation`, error);
  return new OpenRouterResponseError(
    "A IA respondeu num formato inesperado. Tente de novo — se continuar, use \"Criar manualmente\".",
  );
}

/** A real song has more lines than this; a refusal or a "please paste the lyrics" reply has fewer. */
const MIN_TOTAL_LINES = 4;
/** A lyric line is short enough to fit on a slide. Prose addressed to the user is far longer. */
const MAX_LINE_LENGTH = 160;

/**
 * Rejects a "song" that is really the model talking to the user rather than reproducing lyrics.
 *
 * Asked for a song it didn't know, a model answered "Preciso da letra oficial completa […] Pode
 * colar a letra completa aqui?" — which is a perfectly schema-valid AiSongResponse, so it was
 * saved and displayed as the song's lyrics. Zod checks the shape of a response; nothing checked
 * that it was lyrics at all. These two structural signals catch that without keyword-matching in
 * either language: such replies are one or two entries long, and each is a paragraph rather than
 * a line meant for a slide.
 */
function assertLooksLikeLyrics(song: AiSongResponse): void {
  const lines = song.sections.flatMap((section) => section.lines);
  if (lines.length < MIN_TOTAL_LINES) {
    throw new OpenRouterUnknownSongError(UNKNOWN_SONG_MESSAGE);
  }
  const longest = Math.max(...lines.flatMap((line) => [line.original.length, line.translation.length]));
  if (longest > MAX_LINE_LENGTH) {
    throw new OpenRouterUnknownSongError(UNKNOWN_SONG_MESSAGE);
  }
}

/**
 * OpenRouter's web plugin, billed per result — so each search is scoped to what that step
 * actually needs. See https://openrouter.ai/docs/features/web-search.
 *
 * "lyrics" restricts to sites that publish full lyrics, since an unrestricted search for a
 * song title mostly returns streaming/store pages with no words on them. "catalog" is for the
 * identification step instead, which asks whether a recording *exists* — a question streaming
 * platforms and label pages answer better than lyrics sites do.
 */
const SEARCH_MAX_RESULTS = 3;

/**
 * Which engine actually runs depends on the configured model: OpenAI, Anthropic, Google and
 * Perplexity models use the provider's own native search, everything else falls back to Exa.
 * That split matters for the options below — `include_domains` is honoured by OpenAI's native
 * search (`exclude_domains` is not, which is why it isn't used here), while `max_results` is an
 * Exa-engine knob and is inert on a native provider. `search_context_size` is the native
 * equivalent: "high" for lyrics, where a truncated snippet is useless because the whole point is
 * to come away with the complete song; "medium" for identification, which only has to establish
 * that a recording exists and what it's called.
 */
const SEARCH_CONTEXT_SIZE: Record<SearchScope, "low" | "medium" | "high"> = {
  lyrics: "high",
  catalog: "medium",
};

const SEARCH_DOMAINS: Record<SearchScope, string[]> = {
  lyrics: ["letras.mus.br", "vagalume.com.br", "cifraclub.com.br", "genius.com", "azlyrics.com"],
  catalog: [
    "open.spotify.com",
    "music.apple.com",
    "youtube.com",
    "letras.mus.br",
    "genius.com",
    "cifraclub.com.br",
  ],
};

type SearchScope = "lyrics" | "catalog";

async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  search?: SearchScope,
): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterConfigError(
      "A variável OPENROUTER_API_KEY não está configurada. Adicione-a ao arquivo .env.local (veja .env.example).",
    );
  }
  // Everything here rests on how well the model *remembers* specific recordings — including
  // Português adaptations of English worship songs, which smaller models tend not to know and
  // will quietly replace with a literal translation of their own. Worth experimenting with.
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o";

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "PMA Lyrics Studio",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(search
        ? {
            plugins: [
              {
                id: "web",
                max_results: SEARCH_MAX_RESULTS,
                include_domains: SEARCH_DOMAINS[search],
              },
            ],
            web_search_options: { search_context_size: SEARCH_CONTEXT_SIZE[search] },
          }
        : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpenRouterResponseError(`A requisição ao OpenRouter falhou (${res.status}): ${body.slice(0, 500)}`);
  }

  const payload = await res.json();
  const content: string | undefined = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new OpenRouterResponseError("O OpenRouter retornou uma resposta vazia.");
  }

  return extractJson(content);
}

/**
 * What Musixmatch requires to be shown/fired alongside the lyrics it supplied. Null when every
 * line came from the model instead, in which case there is nothing to attribute.
 */
export interface SongAttribution {
  provider: "musixmatch";
  copyright: string;
  trackingUrls: string[];
}

export interface GeneratedSong {
  song: AiSongResponse;
  attribution: SongAttribution | null;
}

function combineAttribution(sources: (MusixmatchLyrics | null)[]): SongAttribution | null {
  const found = sources.filter((source): source is MusixmatchLyrics => source !== null);
  if (found.length === 0) return null;

  // The two sides are usually different recordings with different notices; show each once.
  const copyright = [...new Set(found.map((s) => s.copyright).filter(Boolean))].join(" · ");
  const trackingUrls = [...new Set(found.map((s) => s.trackingPixelUrl).filter(Boolean))];
  return { provider: "musixmatch", copyright, trackingUrls };
}

/** Finds which catalogue entry the model picked, by the title it echoed back. */
function matchCandidate(identified: AiIdentifyResponse, candidates: TrackCandidate[]): TrackCandidate | null {
  if (candidates.length === 0) return null;
  const wanted = identified.title.trim().toLowerCase();
  return candidates.find((c) => c.title.trim().toLowerCase() === wanted) ?? candidates[0];
}

function otherLanguage(language: ChurchLanguage): ChurchLanguage {
  return language === "English" ? "Português (Brasil)" : "English";
}

function describe(title: string, artist: string): string {
  return artist ? `"${title}" by ${artist}` : `"${title}"`;
}

/** Renders recalled lyrics back to plain labelled text, for the pairing prompt to read. */
function lyricsToText(lyrics: AiLyricsResponse): string {
  return lyrics.sections
    .map((section) => `[${section.label}]\n${section.lines.join("\n")}`)
    .join("\n\n");
}

/** Step 1: which song is this, and does a real recording of it exist in the other language? */
async function identifySong(query: string, candidates: TrackCandidate[]): Promise<AiIdentifyResponse> {
  const catalogue = candidates.length
    ? `\n\nCATALOGUE MATCHES (real songs from the lyrics database, best match first):\n${candidates
        .map((c, i) => `${i + 1}. "${c.title}" — ${c.artist || "unknown artist"}`)
        .join("\n")}`
    : "";
  const parsed = await callOpenRouter(IDENTIFY_SYSTEM_PROMPT, `Song hint: "${query}"${catalogue}`, "catalog");
  const result = aiIdentifySchema.safeParse(parsed);
  if (!result.success) {
    throw malformedResponse("identify", result.error);
  }
  return result.data;
}

/**
 * Step 2: one recording's lyrics, in one language, with nothing translated.
 *
 * Musixmatch first — a licensed database that either has the song or plainly doesn't, which is
 * what "does this song exist and how does it go" actually needs. The model is the fallback for
 * whatever the catalogue is missing or isn't licensed to hand over, which is where every wrong
 * lyric so far has come from.
 */
async function recallLyrics(
  title: string,
  artist: string,
  language: ChurchLanguage,
  candidates?: TrackCandidate[],
): Promise<{ lyrics: AiLyricsResponse; attribution: MusixmatchLyrics | null }> {
  // A restricted track is not a missing song: keep walking the list before giving up on the
  // catalogue, since another recording of the same song is usually available.
  const found = candidates?.length
    ? (await fetchFirstAvailable(candidates))?.lyrics ?? null
    : await fetchLyrics(title, artist);
  if (found) {
    return { lyrics: { sections: splitIntoSections(found.text) }, attribution: found };
  }

  const userPrompt = `Reproduce the lyrics of the ${language} recording of ${describe(title, artist)}.\nEvery line you return must be in ${language}.`;
  const parsed = await callOpenRouter(RECALL_SYSTEM_PROMPT, userPrompt, "lyrics");
  assertNotEmptyAnswer(parsed);
  const result = aiLyricsSchema.safeParse(parsed);
  if (!result.success) {
    throw malformedResponse("recall", result.error);
  }
  return { lyrics: result.data, attribution: null };
}

/** Step 3: line up the two recordings by musical position. */
async function pairVersions(
  original: AiLyricsResponse,
  officialVersion: AiLyricsResponse,
  originalLanguage: ChurchLanguage,
  targetLanguage: ChurchLanguage,
): Promise<AiRealignResponse> {
  const userPrompt = `Version A — ${originalLanguage} (this is the "original" side):\n---\n${lyricsToText(original)}\n---\n\nVersion B — ${targetLanguage} (this is the "translation" side):\n---\n${lyricsToText(officialVersion)}\n---`;
  const parsed = await callOpenRouter(PAIR_SYSTEM_PROMPT, userPrompt);
  assertNotEmptyAnswer(parsed);
  const result = aiRealignSchema.safeParse(parsed);
  if (!result.success) {
    throw malformedResponse("pair", result.error);
  }
  return result.data;
}

/**
 * The official-recording path: recall both recordings independently (in parallel — they don't
 * depend on each other, and output tokens are what actually cost time here), then align them.
 * Recalling and aligning have to be separate steps: asking one call for "the lyrics, already
 * paired line-by-line with the other language" quietly forces a literal translation, because a
 * real adapted recording rarely maps 1:1 onto the original's lines.
 */
async function generateFromOfficialVersion(
  identified: AiIdentifyResponse,
  ordered: TrackCandidate[],
): Promise<GeneratedSong> {
  const targetLanguage = otherLanguage(identified.originalLanguage);
  const official = identified.officialVersion;

  const [originalSide, officialSide] = await Promise.all([
    recallLyrics(identified.title, identified.artist, identified.originalLanguage, ordered),
    recallLyrics(official.title || identified.title, official.artist, targetLanguage),
  ]);

  const paired = await pairVersions(
    originalSide.lyrics,
    officialSide.lyrics,
    identified.originalLanguage,
    targetLanguage,
  );

  return {
    song: {
      title: identified.title,
      artist: identified.artist,
      originalLanguage: identified.originalLanguage,
      translationLanguage: targetLanguage,
      isOfficialTranslation: true,
      sections: paired.sections,
    },
    // Both sides can come from the catalogue, and each carries its own notice and view counter.
    attribution: combineAttribution([originalSide.attribution, officialSide.attribution]),
  };
}

/**
 * The fallback path, and what runs whenever no official recording was found: one call that
 * recalls the song and translates it. A literal translation lines up 1:1 with the original by
 * construction, so it needs no separate alignment step.
 */
async function translateSong(
  query: string,
  identified: AiIdentifyResponse | null,
  ordered: TrackCandidate[],
): Promise<GeneratedSong> {
  // With the real lyrics in hand, the model's job shrinks to translating and labelling text it
  // has been given — it never authors a line, which is where the wrong lyrics came from.
  if (identified) {
    const found = ordered.length
      ? (await fetchFirstAvailable(ordered))?.lyrics ?? null
      : await fetchLyrics(identified.title, identified.artist);
    if (found) {
      const targetLanguage = otherLanguage(identified.originalLanguage);
      const userPrompt = `These are the ${identified.originalLanguage} lyrics of ${describe(identified.title, identified.artist)}. Translate them into ${targetLanguage}.\n---\n${found.text}\n---`;
      const parsed = await callOpenRouter(STRUCTURE_TRANSLATE_SYSTEM_PROMPT, userPrompt);
      assertNotEmptyAnswer(parsed);
      const result = aiRealignSchema.safeParse(parsed);
      if (result.success) {
        return {
          song: {
            title: identified.title,
            artist: identified.artist,
            originalLanguage: identified.originalLanguage,
            translationLanguage: targetLanguage,
            isOfficialTranslation: false,
            sections: result.data.sections,
          },
          attribution: combineAttribution([found]),
        };
      }
      console.error("structure/translate failed validation, falling back to full generation", result.error);
    }
  }

  const hint = identified
    ? `Song hint: "${query}"\nThe song has already been identified as ${describe(identified.title, identified.artist)}, originally in ${identified.originalLanguage} — use that identification.`
    : `Song hint: "${query}"`;
  const parsed = await callOpenRouter(GENERATE_SYSTEM_PROMPT, hint, "lyrics");
  assertNotEmptyAnswer(parsed);
  const result = aiSongSchema.safeParse(parsed);
  if (!result.success) {
    throw malformedResponse("translate", result.error);
  }
  return { song: result.data, attribution: null };
}

export async function generateSongWithAi(query: string): Promise<GeneratedSong> {
  // The catalogue searches titles, artists and lyric text at once, so it resolves the same free
  // text the user typed — and it knows songs the model doesn't, which is the whole reason a
  // real Brazilian release could fail here before.
  const candidates = await searchTracks(query);

  let identified: AiIdentifyResponse | null = null;
  try {
    identified = await identifySong(query, candidates);
  } catch (error) {
    // Identification is an optimization, not a requirement — the single-call path below can
    // still identify the song itself, exactly as it did before this pipeline existed.
    console.error("song identification failed, falling back to single-call generation", error);
  }

  // Taking the model at its word when it says it doesn't know the song: pressing on anyway is
  // what produced a "song" whose only lyric was the model asking the user to paste the lyrics.
  // Unless the catalogue found it regardless — the database existing is stronger evidence than
  // the model's memory, and the lyrics will come from there anyway.
  if (identified && !identified.found && candidates.length === 0) {
    throw new OpenRouterUnknownSongError(UNKNOWN_SONG_MESSAGE);
  }

  // The entry the model settled on leads, with the remaining matches behind it as fallbacks for
  // when its lyrics turn out to be withheld.
  const chosen = identified ? matchCandidate(identified, candidates) : (candidates[0] ?? null);
  const ordered = chosen ? [chosen, ...candidates.filter((c) => c !== chosen)] : candidates;

  if (identified?.officialVersion.exists) {
    try {
      const generated = await generateFromOfficialVersion(identified, ordered);
      const result = aiSongSchema.safeParse(generated.song);
      if (result.success) {
        assertLooksLikeLyrics(result.data);
        return { song: result.data, attribution: generated.attribution };
      }
      console.error("official-version result failed validation", result.error);
    } catch (error) {
      // An official version we can't actually retrieve or align is worse than a clean literal
      // translation, so every failure here degrades to the path that was already in production.
      console.error("official-version path failed, falling back to translation", error);
    }
  }

  const generated = await translateSong(query, identified, ordered);
  assertLooksLikeLyrics(generated.song);
  return generated;
}

export async function realignSongWithAi(languageARaw: string, languageBRaw: string): Promise<AiRealignResponse> {
  const userPrompt = `Editor A (as pasted):\n---\n${languageARaw}\n---\n\nEditor B (as pasted):\n---\n${languageBRaw}\n---`;
  const parsed = await callOpenRouter(REALIGN_SYSTEM_PROMPT, userPrompt);
  const result = aiRealignSchema.safeParse(parsed);
  if (!result.success) {
    throw malformedResponse("realign", result.error);
  }
  return result.data;
}
