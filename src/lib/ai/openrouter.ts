import {
  aiLanguageSchema,
  aiRealignWireSchema,
  expandWireSections,
  type AiRealignResponse,
  type AiSongResponse,
} from "./schema";
import {
  fetchLyricsByTrackId,
  fetchTranslation,
  mapMusixmatchLanguage,
  pairLineAligned,
  splitIntoSections,
  type MusixmatchLyrics,
  type TrackCandidate,
} from "@/lib/lyrics/musixmatch";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChurchLanguage = AiSongResponse["originalLanguage"];

/**
 * AI translation is disabled for now — generateSongWithAi() only ever uses Musixmatch's own
 * lyrics/translation. This is the one AI call left in that path: when the catalogue gave no
 * usable language tag, identify which of the two supported languages the lyrics are in so at
 * least the correct side can be filled in. Deliberately minimal (no translation asked of the
 * model) so it can run on a small, fast, cheap model — see LANGUAGE_ONLY_MODEL.
 */
const IDENTIFY_LANGUAGE_SYSTEM_PROMPT = `You are given the real lyrics of a worship/congregational song. Identify which of two supported languages they are written in, as strict JSON.

This tool is used by a bilingual church that only ever needs two languages: English and Português (Brasil).

Rules:
- "originalLanguage" is the language the GIVEN lyrics are actually written in — it must be either "English" or "Português (Brasil)". Read the lyrics to decide; don't guess from the title or artist name alone.
- Respond with ONLY the JSON object below — no markdown code fences, no commentary before or after it. Never address the user.

JSON schema:
{
  "originalLanguage": "English" | "Português (Brasil)"
}`;

const REALIGN_SYSTEM_PROMPT = `You fix and re-align two pasted lyric texts for a bilingual church slide-building tool. The two texts are always English and Português (Brasil), in some order — you are not told which is which and it doesn't matter.

The user pasted a song's lyrics into two editors, one language per editor, but the pasting is often imperfect: a section or line missing from one side, duplicate or extra lines, sections in a different order between the two sides, lines that don't correspond to each other, stray whitespace, or typos.

Your job is to reconcile the two texts into a clean, section-aligned, line-by-line structure:
- Split both into sections and align them with each other.
- Within a section, each line is a pair: make sure both sides have the same number of lines and line i of one corresponds in meaning/position to line i of the other.
- If a line or section is missing from one side, fill it in yourself — translate it literally and faithfully (prioritize accuracy to meaning over rhyme or singability) — rather than leaving it blank.
- Remove accidental duplicate lines/sections; merge or split lines so they correspond 1:1.
- If a section repeats verbatim later in the song, include it again as its own entry in "sections".
- Preserve the actual wording of both languages exactly as given whenever it is already correct — only change what's necessary to fix alignment problems.
- Each line is a 2-element array [editorALine, editorBLine] — the first element is ALWAYS whichever text was pasted into Editor A, the second is ALWAYS Editor B. Do not swap the two editors.
- Section "label" values must always be in Portuguese, regardless of which language is in Editor A or B — e.g. "Verso 1", "Verso 2", "Refrão", "Refrão 2", "Pré-Refrão", "Ponte", "Introdução", "Final".
- Respond with ONLY the JSON object below — no markdown code fences, no commentary before or after it.

JSON schema:
{
  "sections": [
    { "label": string, "lines": [ [string, string] ] }
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

const RECORDING_UNAVAILABLE_MESSAGE =
  'Essa gravação está indisponível no momento (letra restrita ou não encontrada no catálogo). Escolha outra gravação na busca ou use "Criar manualmente".';

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
function looksLikeLyrics(sections: AiSongResponse["sections"]): boolean {
  const lines = sections.flatMap((section) => section.lines);
  if (lines.length < MIN_TOTAL_LINES) return false;
  const longest = Math.max(...lines.flatMap((line) => [line.original.length, line.translation.length]));
  return longest <= MAX_LINE_LENGTH;
}

function assertLooksLikeLyrics(song: AiSongResponse): void {
  if (!looksLikeLyrics(song.sections)) {
    throw new OpenRouterUnknownSongError(UNKNOWN_SONG_MESSAGE);
  }
}

/** Used only for the language-identification call — small, fast, cheap; no translation quality at stake. */
const LANGUAGE_ONLY_MODEL = "openai/gpt-4o-mini";

async function callOpenRouter(systemPrompt: string, userPrompt: string, modelOverride?: string): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterConfigError(
      "A chave da OpenRouter não está configurada. No app instalado, use Ajustes → Chave da OpenRouter; na versão web, defina OPENROUTER_API_KEY no ambiente.",
    );
  }
  const model = modelOverride || process.env.OPENROUTER_MODEL || "openai/gpt-4o";

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

/** What Musixmatch requires to be shown/fired alongside the lyrics it supplied for one side. */
export interface SideAttribution {
  copyright: string;
  trackingUrl: string;
}

export interface GeneratedSong {
  song: AiSongResponse;
  /** The picked recording itself, which always backs the "original" side. */
  originalSource: { commontrackId: number; title: string; artist: string; attribution: SideAttribution };
  /**
   * Attribution for the "translation" side's content, when it came from Musixmatch's own
   * translation of the same recording — never a distinct SideSource, since it isn't a separate
   * recording (see translateKnownLyrics). Null when that side is blank instead.
   */
  translationAttribution: SideAttribution | null;
}

function toAttribution(lyrics: MusixmatchLyrics): SideAttribution {
  return { copyright: lyrics.copyright, trackingUrl: lyrics.trackingPixelUrl };
}

function otherLanguage(language: ChurchLanguage): ChurchLanguage {
  return language === "English" ? "Português (Brasil)" : "English";
}

/** Every line of the original, with an empty translation — used whenever no translation is available. */
function blankTranslationSections(originalText: string): AiSongResponse["sections"] {
  return splitIntoSections(originalText).map((section) => ({
    label: section.label,
    lines: section.lines.map((line) => ({ original: line, translation: "" })),
  }));
}

/** Step used only when the catalogue gave no usable language tag for the picked recording. */
async function identifyLanguageOnly(picked: TrackCandidate, originalLyrics: string): Promise<ChurchLanguage> {
  const userPrompt = `Title: "${picked.title}"\nArtist: ${picked.artist || "unknown"}\nLyrics:\n---\n${originalLyrics}\n---`;
  const parsed = await callOpenRouter(IDENTIFY_LANGUAGE_SYSTEM_PROMPT, userPrompt, LANGUAGE_ONLY_MODEL);
  const result = aiLanguageSchema.safeParse(parsed);
  if (!result.success) {
    throw malformedResponse("identify-language", result.error);
  }
  return result.data.originalLanguage;
}

function finalizeSong(
  picked: TrackCandidate,
  originalLanguage: ChurchLanguage,
  sections: AiSongResponse["sections"],
  original: MusixmatchLyrics,
  usableTranslation: MusixmatchLyrics | null,
): GeneratedSong {
  const song: AiSongResponse = {
    title: picked.title,
    artist: picked.artist,
    originalLanguage,
    translationLanguage: otherLanguage(originalLanguage),
    sections,
  };
  assertLooksLikeLyrics(song);
  return {
    song,
    originalSource: {
      commontrackId: picked.commontrackId,
      title: picked.title,
      artist: picked.artist,
      attribution: toAttribution(original),
    },
    translationAttribution: usableTranslation ? toAttribution(usableTranslation) : null,
  };
}

/**
 * AI translation is disabled for now — this only ever uses Musixmatch's own lyrics and, when
 * available, Musixmatch's own translation of the same recording (paired locally, no AI involved).
 * The one AI call left is identifyLanguageOnly(), and only when the catalogue didn't already say
 * what language this is. When no usable translation is found, the translation side is left blank
 * for the user to fill in by hand (or, later, by picking a different recording for that side).
 */
export async function generateSongWithAi(picked: TrackCandidate): Promise<GeneratedSong> {
  const original = await fetchLyricsByTrackId(picked.commontrackId);
  if (!original) {
    throw new OpenRouterUnknownSongError(RECORDING_UNAVAILABLE_MESSAGE);
  }

  const originalLanguage =
    mapMusixmatchLanguage(picked.language) ?? (await identifyLanguageOnly(picked, original.text));

  const targetCode = originalLanguage === "English" ? "pt" : "en";
  const translated = await fetchTranslation(picked.commontrackId, targetCode);
  // Guard against a wrong originalLanguage (a misread, or a mis-tagged catalogue fallback):
  // if Musixmatch's "translation" actually comes back identical to the original, pairLineAligned
  // would succeed trivially (matching section/line counts are guaranteed for identical text) and
  // produce a two-column song where both columns show the same language. Treat that as if no
  // translation were available.
  const usableTranslation =
    translated && translated.text.trim() !== original.text.trim() ? translated : null;
  const paired = usableTranslation ? pairLineAligned(original.text, usableTranslation.text) : null;

  if (paired && looksLikeLyrics(paired)) {
    return finalizeSong(picked, originalLanguage, paired, original, usableTranslation);
  }
  return finalizeSong(picked, originalLanguage, blankTranslationSections(original.text), original, null);
}

export async function realignSongWithAi(languageARaw: string, languageBRaw: string): Promise<AiRealignResponse> {
  const userPrompt = `Editor A (as pasted):\n---\n${languageARaw}\n---\n\nEditor B (as pasted):\n---\n${languageBRaw}\n---`;
  const parsed = await callOpenRouter(REALIGN_SYSTEM_PROMPT, userPrompt);
  const result = aiRealignWireSchema.safeParse(parsed);
  if (!result.success) {
    throw malformedResponse("realign", result.error);
  }
  return { sections: expandWireSections(result.data.sections) };
}
