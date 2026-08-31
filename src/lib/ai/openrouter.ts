import { aiRealignSchema, aiSongSchema, type AiRealignResponse, type AiSongResponse } from "./schema";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const GENERATE_SYSTEM_PROMPT = `You identify worship/congregational songs from a short hint (a title, a lyric snippet, or a description) and produce their lyrics aligned line-by-line with a translation, formatted as strict JSON for a slide-building tool.

This tool is used by a bilingual church that only ever needs two languages: English and Português (Brasil). ALWAYS return exactly this language pair — never any other language.

Rules:
- Identify the single most likely song and its artist/writer from the hint.
- Determine which of the two supported languages (English or Português (Brasil)) the song's real/original lyrics were written in — that is "originalLanguage" — and set "translationLanguage" to the other one. (If the song was actually written in a third language, treat whichever of English/Português (Brasil) has the best-known official congregational version as the original, and produce a faithful version in the other.)
- Reproduce the ORIGINAL lyrics from memory, split into sections, one array entry per lyric line exactly as it would appear on a lyric slide.
- Provide the TRANSLATION into the other language. If a well-known official/singable translation already exists (very common for congregational worship songs performed worldwide), use that one and set isOfficialTranslation to true. Otherwise write your own fluent, singable translation and set isOfficialTranslation to false.
- Within a section, "lines" must have the original and translation arrays the same length, and line i of the translation must correspond in meaning/position to line i of the original, so they can be displayed side by side.
- If a section (like a chorus) repeats verbatim later in the song, include it again as its own entry in "sections" rather than referencing the earlier one.
- Section "label" values must always be in Portuguese, regardless of which language the lyrics are in — e.g. "Verso 1", "Verso 2", "Refrão", "Refrão 2", "Pré-Refrão", "Ponte", "Introdução", "Final".
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
- If a line or section is missing from one side, fill it in yourself (translate it) rather than leaving it blank.
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

async function callOpenRouter(systemPrompt: string, userPrompt: string): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterConfigError(
      "A variável OPENROUTER_API_KEY não está configurada. Adicione-a ao arquivo .env.local (veja .env.example).",
    );
  }
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Poiema Lyrics Studio",
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

export async function generateSongWithAi(query: string): Promise<AiSongResponse> {
  const userPrompt = `Song hint: "${query}"`;
  const parsed = await callOpenRouter(GENERATE_SYSTEM_PROMPT, userPrompt);
  const result = aiSongSchema.safeParse(parsed);
  if (!result.success) {
    throw new OpenRouterResponseError(`A resposta da IA não seguiu o formato esperado: ${result.error.message}`);
  }
  return result.data;
}

export async function realignSongWithAi(languageARaw: string, languageBRaw: string): Promise<AiRealignResponse> {
  const userPrompt = `Editor A (as pasted):\n---\n${languageARaw}\n---\n\nEditor B (as pasted):\n---\n${languageBRaw}\n---`;
  const parsed = await callOpenRouter(REALIGN_SYSTEM_PROMPT, userPrompt);
  const result = aiRealignSchema.safeParse(parsed);
  if (!result.success) {
    throw new OpenRouterResponseError(`A resposta da IA não seguiu o formato esperado: ${result.error.message}`);
  }
  return result.data;
}
