# Certain-song translation pipeline

## Context

Today, `generateSongWithAi(query, picked?)` supports two entry points: a picked catalogue
recording (`picked` set — exact `commontrackId`, certain title/artist) or free text alone
(`picked` undefined — the model has to guess which song is meant, using catalogue search results
only as hints). The free-text path exists because catalogue-based picking didn't always exist;
now that search-and-pick is the primary flow (`src/components/studio/NewSongDialog.tsx`), the
free-text path is both unnecessary and actively wasteful:

- `identifySong` still runs a full OpenRouter call (with web search) to "find" the song from
  "CATALOGUE MATCHES" even when that list has exactly one entry — the picked one. The only things
  that call still contributes when a song is picked are `originalLanguage` and `officialVersion`.
- `matchCandidate` and `fetchFirstAvailable`'s multi-candidate walk exist to let the app guess
  among several matches; with exactly one candidate they're a no-op wrapped in machinery.
- The full free-generation fallback (`GENERATE_SYSTEM_PROMPT`, "reproduce this song from memory
  with no catalogue backing at all") produces the least reliable output in the app (this is the
  path that historically returned wrong lyrics) and, once picking is mandatory, never needs to run.

Separately, probing `track.lyrics.translation.get` (`scripts/musixmatch-probe.mjs` plus fresh
probes run in this session) showed it returns real, usable, **line-aligned** translated lyrics for
at least some catalogue entries (confirmed on Hillsong "Oceans" → pt), though coverage is
inconsistent (empty/restricted for smaller catalogue entries like "Estou Te Preparando") and the
translation is literal/mechanical, not the officially *recorded* adapted version. That makes it a
good zero-AI-cost replacement for today's AI literal-translation fallback, but not a replacement
for finding a real official recording.

## Goals

- Require every generated song to originate from an explicit catalogue pick or manual entry —
  remove the free-text "Gerar com IA" path entirely.
- Cut AI calls/tokens that are now redundant because the song is certain.
- Prefer Musixmatch's own translation over an AI literal translation when Musixmatch has one,
  without giving up the existing preference for a real recorded official version when one exists.
- Remove the code that only existed to support multi-candidate uncertainty.

## Non-goals

- Changing how catalogue search itself ranks/returns candidates (that's the reranking work already
  shipped).
- Changing the official-version *recall* or *pairing* prompts — they're unaffected by this.
- Building a UI for the user to review/edit which official version the AI picked — out of scope
  here.

## Design

### 1. UI (`NewSongDialog.tsx`)

- Remove the "Gerar com IA" button and the no-`picked` branch of `handleGenerate`.
  `handleGenerate` takes a required `TrackCandidate`.
- `handleSearch`'s `!outcome.configured` branch no longer calls `handleGenerate()`; it sets an
  empty result set so the existing "Nada encontrado no catálogo" messaging area can show a
  manual-only variant ("Catálogo indisponível. Crie manualmente.").
- The zero-results message drops "Você ainda pode gerar com IA ou colar a letra você mesmo" in
  favor of pointing only at "Criar manualmente".

### 2. Signatures

- `generateSongWithAi(picked: TrackCandidate): Promise<GeneratedSong>` — drops `query`.
- `useGenerateSong().generate(picked: TrackCandidate)` — drops `query`; the in-progress label
  already reads from `picked.title`/`picked.artist` client-side, not from the server, so nothing
  downstream needs the raw query string.
- `POST /api/generate-song` request schema: `{ picked: TrackCandidate }`, `picked` required,
  `query` removed.

### 3. Musixmatch layer (`musixmatch.ts`)

New function:

```ts
export async function fetchTranslation(
  commontrackId: number,
  targetLanguage: "en" | "pt",
): Promise<MusixmatchLyrics | null>
```

Wraps `track.lyrics.translation.get`. Reads `body.lyrics.lyrics_translated` (not the outer
`lyrics_body`, which is the *original*, untranslated text — confirmed by probing). Applies the
same restricted/empty-body guard `readLyrics` already uses for the plain-lyrics endpoints. Returns
`null` on empty body, `restricted`, non-200 status, or missing key — same contract as
`fetchLyrics`/`fetchLyricsByTrackId`.

New pure helper (unit-testable, no network):

```ts
export function pairLineAligned(
  originalText: string,
  translatedText: string,
): { label: string; lines: { original: string; translation: string } }[] | null
```

Splits both texts into sections with `splitIntoSections`, and zips them section-by-section,
line-by-line. Returns `null` (not a best-effort partial pairing) if the section count or any
section's line count doesn't match between the two — that mismatch means the "translation" isn't
actually a line-for-line rendering of this exact body (stale cache, partial translation, etc.), and
the caller should fall back to the AI literal-translation path instead of showing misaligned lines.

Remove `fetchFirstAvailable` — it only existed to walk multiple candidates; with a single picked
track this reduces to `fetchLyricsByTrackId(picked.commontrackId)` at every call site.

### 4. AI pipeline (`openrouter.ts`)

Replaces `identifySong` with a leaner call:

```ts
async function identifyOfficialVersion(
  picked: TrackCandidate,
  originalLyrics: string,
): Promise<{ originalLanguage: ChurchLanguage; officialVersion: { exists: boolean; title: string; artist: string } }>
```

New system prompt (draft, refined during implementation):

> You are given a specific worship/congregational song recording — title, artist, and its actual
> lyrics — already confirmed to exist. You are not choosing or identifying a song; it is given.
> Determine two things: (1) "originalLanguage" — which of English / Português (Brasil) this
> recording's lyrics are actually in. (2) "officialVersion" — whether a separate, officially
> RECORDED version of the same song exists in the *other* of those two languages: a real released
> recording by a known artist/ministry, not a translation you'd produce yourself. Set
> officialVersion.exists to true only when search results (or reliable memory) name a real such
> recording; a clean literal translation is better than an invented one.

New schema (`schema.ts`), replacing `aiIdentifySchema`:

```ts
export const aiOfficialVersionSchema = z.object({
  originalLanguage: churchLanguageSchema,
  officialVersion: z.object({
    exists: z.boolean(),
    title: z.string().default(""),
    artist: z.string().default(""),
  }),
});
```

`found`/`title`/`artist` are dropped — the caller already knows these with certainty from `picked`
and always uses `picked.title`/`picked.artist` for the final song's metadata, never an AI echo.

`generateSongWithAi`, restructured:

```ts
export async function generateSongWithAi(picked: TrackCandidate): Promise<GeneratedSong> {
  const original = await fetchLyricsByTrackId(picked.commontrackId);
  if (!original) {
    throw new OpenRouterUnknownSongError(RECORDING_UNAVAILABLE_MESSAGE);
  }

  let meta: { originalLanguage: ChurchLanguage; officialVersion: OfficialVersion } | null = null;
  try {
    meta = await identifyOfficialVersion(picked, original.text);
  } catch (error) {
    console.error("official-version identification failed", error);
  }

  // AI call failed outright: fall back to Musixmatch's own language tag rather than failing the
  // whole generation, but skip the official-version search — we have no language-independent way
  // to ask for it now.
  const originalLanguage = meta?.originalLanguage ?? mapMusixmatchLanguage(picked.language);
  if (!originalLanguage) {
    throw new OpenRouterResponseError(LANGUAGE_UNKNOWN_MESSAGE);
  }
  const officialVersion = meta?.officialVersion ?? { exists: false, title: "", artist: "" };

  if (officialVersion.exists) {
    try {
      return await generateFromOfficialVersion(picked, original, originalLanguage, officialVersion);
    } catch (error) {
      console.error("official-version path failed, falling back to translation", error);
    }
  }

  return await translateKnownLyrics(picked, original, originalLanguage);
}
```

`generateFromOfficialVersion` no longer re-fetches the original side (it's passed in already
fetched) — it converts it locally with `splitIntoSections(original.text)` (no AI call), recalls
the *official version*'s lyrics (existing `recallLyrics`, by the AI-supplied title/artist,
unchanged), and pairs the two (existing `pairVersions`, unchanged).

`translateKnownLyrics` (replaces the picked-relevant half of `translateSong`; the free-generation
half is deleted entirely):

```ts
async function translateKnownLyrics(
  picked: TrackCandidate,
  original: MusixmatchLyrics,
  originalLanguage: ChurchLanguage,
): Promise<GeneratedSong> {
  const targetLanguage = otherLanguage(originalLanguage);
  const targetCode = originalLanguage === "English" ? "pt" : "en";

  const translated = await fetchTranslation(picked.commontrackId, targetCode);
  const paired = translated && pairLineAligned(original.text, translated.text);
  if (paired) {
    return {
      song: { title: picked.title, artist: picked.artist, originalLanguage, translationLanguage: targetLanguage, isOfficialTranslation: false, sections: paired },
      attribution: combineAttribution([original, translated]),
    };
  }

  // Musixmatch has no usable translation for this recording — ask the model to translate the
  // real, already-fetched lyrics (STRUCTURE_TRANSLATE_SYSTEM_PROMPT, unchanged).
  const parsed = await callOpenRouter(STRUCTURE_TRANSLATE_SYSTEM_PROMPT, /* ... */);
  assertNotEmptyAnswer(parsed);
  const result = aiRealignSchema.safeParse(parsed);
  if (!result.success) throw malformedResponse("translate", result.error);
  return {
    song: { title: picked.title, artist: picked.artist, originalLanguage, translationLanguage: targetLanguage, isOfficialTranslation: false, sections: result.data.sections },
    attribution: combineAttribution([original]),
  };
}
```

`GENERATE_SYSTEM_PROMPT`, `aiSongSchema`'s use as an AI *output* target (it stays as the final
`GeneratedSong.song` shape, just never AI-authored from scratch anymore), `matchCandidate`, and the
multi-candidate branches of `recallLyrics`/`translateSong` are deleted.

### 5. Error handling

| Failure | Behavior |
|---|---|
| Picked track's own lyrics restricted/unavailable on Musixmatch | Fail fast with "essa gravação está indisponível — escolha outra ou crie manualmente." No AI calls attempted — there is nothing to translate. |
| `identifyOfficialVersion` throws, `picked.language` maps to a known language | Degrade to that language, `officialVersion.exists = false` (skip straight to translation). |
| `identifyOfficialVersion` throws, `picked.language` unmapped/empty | Fail with a clear "não consegui determinar o idioma desta gravação" error — no more silent full-invention fallback. |
| Official-version path fails at any step (recall, pairing, schema) | Degrade to `translateKnownLyrics`, unchanged from today's degrade behavior. |
| Musixmatch translation exists but line/section counts don't match original | `pairLineAligned` returns `null`; degrade to AI literal translation. |
| Musixmatch not configured, or catalogue search finds nothing | Dialog shows manual-only messaging; no AI path reachable without a `picked` track. |

### 6. Testing

- `pairLineAligned`: pure, unit-tested with `node --test` (matching section/line counts pairs
  correctly; mismatched counts return `null`; empty inputs).
- `fetchTranslation`'s envelope parsing: same pattern as existing `readLyrics` tests would take
  (mock envelope in, `MusixmatchLyrics | null` out) — added alongside it.
- `mapMusixmatchLanguage`: pure, unit-tested. Matches by the language code's first two letters,
  lowercased, not exact string equality — Musixmatch's `lyrics_language` tag has been observed
  empty, and real-world values like "pt-br" or "en-US" should map the same as "pt"/"en" (`"en"` /
  `"en-US"` → English, `"pt"` / `"pt-br"` / `"pt-PT"` → Português, anything else/empty → `null`).
- AI-call paths (`identifyOfficialVersion`, recall, pair, structure-translate) stay
  network-dependent and unverified by automated tests, consistent with the rest of this file today
  — verified manually against the real APIs before calling this done, same as the reranking work.
- UI change verified by running the app (`npm run dev`) and confirming: picking a track generates
  without the old free-generation button present; a restricted/unavailable pick surfaces the new
  error; empty search results show manual-only messaging.

## Addendum: quick-add popup removal

Discovered during planning: `src/app/quick-add/page.tsx` (a global-hotkey popup, desktop app
only) is a second entry point into `useGenerateSong().generate()`, calling it with free text and
no `picked` — the same path this design removes. Its single-field, no-picker UI has no room for a
catalogue picker, and redesigning it to auto-pick or hand off to the main dialog was raised and
declined. Decision: remove the quick-add popup and its global hotkey entirely, for now, rather than
adapt it. This removes:

- `src/app/quick-add/page.tsx`, `src/lib/desktop/useQuickAddListener.ts`
- The `useQuickAddListener()` wiring in `src/components/layout/AppShell.tsx`
- The global-shortcut registration, `show_quick_add`, and the `quick-add` window in
  `src-tauri/src/lib.rs`, and the `tauri-plugin-global-shortcut` dependency in
  `src-tauri/Cargo.toml`
- The `"quick-add"` entry in `src-tauri/capabilities/default.json`'s `windows` list

Left alone (lower confidence they're quick-add-only, riskier to remove without desktop testing):
the `core:window:allow-show/hide/set-focus` and `core:event:allow-emit/allow-listen` capability
permissions, even though only quick-add's code currently exercises them.

## Files touched

- `src/components/studio/NewSongDialog.tsx`
- `src/lib/useGenerateSong.ts`
- `src/app/api/generate-song/route.ts`
- `src/lib/lyrics/musixmatch.ts` (+ its test file)
- `src/lib/ai/openrouter.ts`
- `src/lib/ai/schema.ts`
