import { aiSongSchema, type AiSongResponse } from "./schema";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = `You identify worship/congregational songs from a short hint (a title, a lyric snippet, or a description) and produce their lyrics aligned line-by-line with a translation, formatted as strict JSON for a slide-building tool.

Rules:
- Identify the single most likely song and its artist/writer from the hint.
- Reproduce the ORIGINAL lyrics from memory, split into sections (Verse 1, Chorus, Bridge, etc.), one array entry per lyric line exactly as it would appear on a lyric slide.
- Provide a TRANSLATION into the requested target language. If a well-known official/singable translation already exists (very common for congregational worship songs performed worldwide), use that one and set isOfficialTranslation to true. Otherwise write your own fluent, singable translation and set isOfficialTranslation to false.
- Within a section, "lines" must have the original and translation arrays the same length, and line i of the translation must correspond in meaning/position to line i of the original, so they can be displayed side by side.
- If a section (like a chorus) repeats verbatim later in the song, include it again as its own entry in "sections" rather than referencing the earlier one.
- Respond with ONLY the JSON object below — no markdown code fences, no commentary before or after it.

JSON schema:
{
  "title": string,
  "artist": string,
  "key": string | null,
  "originalLanguage": string,
  "translationLanguage": string,
  "isOfficialTranslation": boolean,
  "sections": [
    { "label": string, "lines": [ { "original": string, "translation": string } ] }
  ]
}`;

function extractJson(text: string): unknown {
  const withoutFences = text.replace(/```json\s*|```/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("The AI response did not contain a JSON object.");
  }
  return JSON.parse(withoutFences.slice(start, end + 1));
}

export class OpenRouterConfigError extends Error {}
export class OpenRouterResponseError extends Error {}

export async function generateSongWithAi(query: string, targetLanguage: string): Promise<AiSongResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterConfigError(
      "OPENROUTER_API_KEY is not configured. Add it to your .env.local file (see .env.example).",
    );
  }
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  const userPrompt = `Song hint: "${query}"\nTarget translation language: ${
    targetLanguage.trim() || "the most natural/common language for this song in worship settings"
  }.`;

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Lyrics Studio",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpenRouterResponseError(`OpenRouter request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const payload = await res.json();
  const content: string | undefined = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new OpenRouterResponseError("OpenRouter returned an empty response.");
  }

  const parsed = extractJson(content);
  const result = aiSongSchema.safeParse(parsed);
  if (!result.success) {
    throw new OpenRouterResponseError(`AI response did not match the expected format: ${result.error.message}`);
  }
  return result.data;
}
