# Certain-Song Translation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require every generated song to come from an explicit catalogue pick (or manual entry) instead of free-text AI guessing, and use that certainty to cut redundant AI calls and prefer Musixmatch's own translation over an AI literal translation when it's available.

**Architecture:** `generateSongWithAi` drops its `query` parameter and takes a required `TrackCandidate`. It always fetches that exact recording's lyrics from Musixmatch first (failing fast if unavailable), then asks a trimmed-down AI call for only `originalLanguage` + whether an officially *recorded* version exists in the other language. When one exists, the existing recall→pair path runs (unchanged). When it doesn't (or that path fails), a new Musixmatch-translation fetch is tried first — its output is line-aligned with the original, so it can be paired without AI — before falling back to today's AI literal-translation call. A second free-text entry point (the desktop app's global-hotkey quick-add popup) has no room for a catalogue picker and is removed rather than adapted.

**Tech Stack:** Next.js/TypeScript (App Router), Zod, Musixmatch API, OpenRouter, Zustand, Tauri (Rust) for the desktop shell. No test framework beyond Node's built-in `node --test` runner (introduced earlier this session for `src/lib/lyrics/musixmatch.test.mts`) — network-dependent code (Musixmatch, OpenRouter) is verified manually against the real APIs, matching this codebase's existing convention (see `scripts/musixmatch-probe.mjs` and the commit history of `src/lib/ai/openrouter.ts`).

**Spec:** `docs/superpowers/specs/2026-09-02-certain-song-translation-pipeline-design.md`

## Global Constraints

- `picked` (a full `TrackCandidate`) is required everywhere in the generation flow from this point on — no free-text-only path remains anywhere in the app, including the desktop quick-add popup (removed).
- No new test framework or dependency. Pure functions get `node --test` (`.test.mts`, same file as the existing `combineSearchResults` tests). Network-dependent code is verified manually against the real APIs.
- Musixmatch's own translation (`fetchTranslation`) is only ever a fallback for when no officially recorded version was found (or that path fails) — it must never short-circuit the AI's search for a real official recording.
- Never silently substitute a different recording than the one the user picked. An unavailable picked recording is a user-facing error, not a fallback to another candidate.
- `.env.local` in this repo already has both `MUSIXMATCH_API_KEY` and `OPENROUTER_API_KEY` set, for manual end-to-end verification against the real APIs.

---

## Task 1: Remove the quick-add popup and global hotkey

**Files:**
- Delete: `src/app/quick-add/page.tsx`
- Delete: `src/lib/desktop/useQuickAddListener.ts`
- Modify: `src/components/layout/AppShell.tsx:19,44`
- Modify: `src/lib/generationStore.ts:12-18`
- Modify: `src/lib/useGenerateSong.ts:9-17`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml:28`
- Modify: `src-tauri/capabilities/default.json:5`

**Interfaces:**
- Produces: `useGenerateSong()` still exports `{ generate, search }` (signatures unchanged in this task — Task 6 changes them); no other task in this plan depends on anything quick-add-specific.

This is a removal task — there's no new behavior to red/green test. Each step removes one piece and the final step verifies nothing was left dangling.

- [ ] **Step 1: Delete the two TypeScript files**

```bash
rm src/app/quick-add/page.tsx
rmdir src/app/quick-add
rm src/lib/desktop/useQuickAddListener.ts
```

- [ ] **Step 2: Remove the listener wiring from `AppShell.tsx`**

Remove this import (line 19):
```ts
import { useQuickAddListener } from "@/lib/desktop/useQuickAddListener";
```

Remove this call (line 44, inside the `AppShell` function body):
```ts
  useQuickAddListener();
```

- [ ] **Step 3: Fix the now-stale doc comment on `generationStore.ts`**

Replace:
```ts
/**
 * Ephemeral (not persisted) state driving the full-screen "Gerando…" overlay.
 * Both the in-app "Nova música" dialog (same window) and the quick-add popup
 * (a separate webview, relayed through Tauri events — see
 * src/lib/desktop/useQuickAddListener.ts) write into this same store so they
 * share one overlay instead of each showing their own inline loading state.
 */
```
with:
```ts
/** Ephemeral (not persisted) state driving the full-screen "Gerando…" overlay. */
```

- [ ] **Step 4: Fix the now-stale doc comment on `useGenerateSong.ts`**

Replace:
```ts
/**
 * Shared "Generate with AI" flow: calls /api/generate-song and saves the
 * result as a new song. Used by both the in-app "Nova música" dialog and the
 * standalone quick-add popup window (desktop app, global hotkey) — both hand
 * the query off to the full-screen loading/error overlay (useGenerationStore)
 * rather than showing their own inline loading state, so the result is
 * returned directly instead of exposed as hook state (which the quick-add
 * popup can't rely on anyway — it closes right after calling this).
 */
```
with:
```ts
/**
 * Shared "Generate with AI" flow: calls /api/generate-song and saves the
 * result as a new song. Hands the picked track off to the full-screen
 * loading/error overlay (useGenerationStore) rather than showing its own
 * inline loading state, so the result is returned directly instead of
 * exposed as hook state.
 */
```

- [ ] **Step 5: Remove the global-shortcut plugin and quick-add window from the Rust side**

In `src-tauri/src/lib.rs`, remove the import:
```rust
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
```

Remove `Emitter` from this import (it's only used by the code being deleted below) — change:
```rust
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
```
to:
```rust
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
```

Remove the `BaseUrl` struct and its doc comment entirely:
```rust
/// The main window's URL, minus the path — computed once in setup() (dev vs.
/// bundled-sidecar) and reused whenever the quick-add window is (re)created.
struct BaseUrl(String);
```

Remove the `QUICK_ADD_SHORTCUT` constant:
```rust
const QUICK_ADD_SHORTCUT: &str = "CmdOrCtrl+Alt+Shift+N";
```

Remove the global-shortcut plugin registration from the builder chain — change:
```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin({
            let target: Shortcut = QUICK_ADD_SHORTCUT
                .parse()
                .expect("QUICK_ADD_SHORTCUT must be a valid accelerator string");
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &target && event.state() == ShortcutState::Pressed {
                        show_quick_add(app);
                    }
                })
                .build()
        })
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
```
to:
```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
```

Remove the shortcut registration inside `.setup()` — delete this whole block (including its comment and the blank line after it):
```rust
            // Best-effort: the app is fully usable without the quick-add hotkey (the
            // "Nova música" button covers the same flow), so a registration failure
            // — the combo already taken by another app, a permission the OS denied,
            // whatever — must not take the whole app down with it.
            if let Err(err) = app.global_shortcut().register(QUICK_ADD_SHORTCUT) {
                log::error!("failed to register quick-add global shortcut: {err}");
            }

```

Remove the `BaseUrl` management call from `create_main_window` — change:
```rust
    app.manage(BaseUrl(base_url.clone()));

    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(base_url.parse()?))
```
to:
```rust
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(base_url.parse()?))
```

Remove the entire `show_quick_add` function, including its doc comment:
```rust
/// Shows the "quick add a song" popup (global hotkey target), creating it on
/// first use and just re-showing/focusing it afterwards — recreating the
/// webview every time would add a visible reload delay to what's meant to be
/// an instant, spotlight-style popup.
fn show_quick_add(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("quick-add") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("quick-add-shown", ());
        return;
    }

    let base_url = app.state::<BaseUrl>().0.clone();
    let url = format!("{base_url}/quick-add");
    let Ok(parsed) = url.parse() else { return };

    // A background app (this hotkey typically fires while some other app, e.g.
    // ProPresenter, is focused) doesn't automatically get OS-level keyboard
    // focus for a window it just created — an explicit set_focus() request is
    // needed, or the input inside never actually becomes focusable until the
    // user clicks it once themselves.
    if let Ok(window) = WebviewWindowBuilder::new(app, "quick-add", WebviewUrl::External(parsed))
        .title("Nova música")
        .inner_size(560.0, 100.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .center()
        .skip_taskbar(true)
        .build()
    {
        let _ = window.set_focus();
    }
}
```

- [ ] **Step 6: Remove the Cargo dependency**

In `src-tauri/Cargo.toml`, remove this line:
```toml
tauri-plugin-global-shortcut = "2"
```

- [ ] **Step 7: Remove the quick-add window from the capabilities file**

In `src-tauri/capabilities/default.json`, change:
```json
  "windows": ["main", "quick-add"],
```
to:
```json
  "windows": ["main"],
```

- [ ] **Step 8: Verify nothing references the removed feature, and both toolchains still build**

```bash
grep -rn "quick-add\|quickAdd\|QuickAdd\|global_shortcut\|GlobalShortcut\|show_quick_add\|BaseUrl\|Emitter" src src-tauri --include="*.ts" --include="*.tsx" --include="*.rs" --include="*.json"
```
Expected: no output (the `capabilities/default.json` grep for "quick-add" should now find nothing — it's gone from the `windows` array).

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint src/components/layout/AppShell.tsx src/lib/generationStore.ts src/lib/useGenerateSong.ts
cd src-tauri && cargo check && cd ..
```
Expected: all clean, no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Remove the quick-add popup and global hotkey

Its single-field, no-picker UI has no room for a catalogue picker,
and the free-text generation path it called is being removed. See
docs/superpowers/specs/2026-09-02-certain-song-translation-pipeline-design.md."
```

---

## Task 2: `mapMusixmatchLanguage` in `musixmatch.ts`

**Files:**
- Modify: `src/lib/lyrics/musixmatch.ts`
- Test: `src/lib/lyrics/musixmatch.test.mts`

**Interfaces:**
- Produces: `export function mapMusixmatchLanguage(tag: string): "English" | "Português (Brasil)" | null`

- [ ] **Step 1: Write the failing tests**

In `src/lib/lyrics/musixmatch.test.mts`, change the import line from:
```ts
import { combineSearchResults, type TrackCandidate } from "./musixmatch.ts";
```
to:
```ts
import { combineSearchResults, mapMusixmatchLanguage, type TrackCandidate } from "./musixmatch.ts";
```

Then append these tests to the end of the file:
```ts

test("mapMusixmatchLanguage maps bare and regional codes to a church language", () => {
  assert.equal(mapMusixmatchLanguage("en"), "English");
  assert.equal(mapMusixmatchLanguage("en-US"), "English");
  assert.equal(mapMusixmatchLanguage("pt"), "Português (Brasil)");
  assert.equal(mapMusixmatchLanguage("pt-br"), "Português (Brasil)");
  assert.equal(mapMusixmatchLanguage("pt-PT"), "Português (Brasil)");
});

test("mapMusixmatchLanguage returns null for unknown or empty tags", () => {
  assert.equal(mapMusixmatchLanguage(""), null);
  assert.equal(mapMusixmatchLanguage("es"), null);
  assert.equal(mapMusixmatchLanguage("fr-FR"), null);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
node --test src/lib/lyrics/musixmatch.test.mts
```
Expected: fails with `SyntaxError: The requested module './musixmatch.ts' does not provide an export named 'mapMusixmatchLanguage'`.

- [ ] **Step 3: Implement it**

Add to `src/lib/lyrics/musixmatch.ts`, near `combineSearchResults` (after the `TrackCandidate` interface, before `interface SearchEnvelope`, is a fine spot — it's used by callers outside this file just like `TrackCandidate` is):

```ts
/**
 * Maps a Musixmatch language tag (often a bare "en"/"pt", sometimes regional like "pt-br" or
 * "en-US", sometimes missing entirely) to one of the app's two supported church languages.
 * Matches by the tag's first two letters rather than exact equality, and returns null rather
 * than guessing when the tag is empty or neither English nor Portuguese.
 */
export function mapMusixmatchLanguage(tag: string): "English" | "Português (Brasil)" | null {
  const prefix = tag.trim().slice(0, 2).toLowerCase();
  if (prefix === "en") return "English";
  if (prefix === "pt") return "Português (Brasil)";
  return null;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
node --test src/lib/lyrics/musixmatch.test.mts
```
Expected: all tests pass (6 total: the 4 existing `combineSearchResults` tests + the 2 new ones).

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/lib/lyrics/musixmatch.ts src/lib/lyrics/musixmatch.test.mts
git commit -m "Add mapMusixmatchLanguage, a fallback when the AI language call fails"
```

---

## Task 3: `pairLineAligned` in `musixmatch.ts`

**Files:**
- Modify: `src/lib/lyrics/musixmatch.ts`
- Test: `src/lib/lyrics/musixmatch.test.mts`

**Interfaces:**
- Consumes: `splitIntoSections(text: string): { label: string; lines: string[] }[]` (already exported in this file).
- Produces: `export function pairLineAligned(originalText: string, translatedText: string): { label: string; lines: { original: string; translation: string } }[] | null`

- [ ] **Step 1: Write the failing tests**

Change the import line in `src/lib/lyrics/musixmatch.test.mts` from:
```ts
import { combineSearchResults, mapMusixmatchLanguage, type TrackCandidate } from "./musixmatch.ts";
```
to:
```ts
import { combineSearchResults, mapMusixmatchLanguage, pairLineAligned, type TrackCandidate } from "./musixmatch.ts";
```

Append these tests:
```ts

test("pairLineAligned zips matching sections and lines by position", () => {
  const original = "Line one\nLine two\n\nChorus line";
  const translated = "Linha um\nLinha dois\n\nLinha do refrão";

  const result = pairLineAligned(original, translated);

  assert.deepEqual(result, [
    { label: "Parte 1", lines: [
      { original: "Line one", translation: "Linha um" },
      { original: "Line two", translation: "Linha dois" },
    ] },
    { label: "Parte 2", lines: [
      { original: "Chorus line", translation: "Linha do refrão" },
    ] },
  ]);
});

test("pairLineAligned returns null when section counts differ", () => {
  const original = "Line one\n\nLine two";
  const translated = "Linha um";

  assert.equal(pairLineAligned(original, translated), null);
});

test("pairLineAligned returns null when a section's line count differs", () => {
  const original = "Line one\nLine two";
  const translated = "Linha um";

  assert.equal(pairLineAligned(original, translated), null);
});

test("pairLineAligned returns null for empty input", () => {
  assert.equal(pairLineAligned("", ""), null);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
node --test src/lib/lyrics/musixmatch.test.mts
```
Expected: fails — `pairLineAligned` is not exported.

- [ ] **Step 3: Implement it**

Add to `src/lib/lyrics/musixmatch.ts`, directly after `splitIntoSections` (the function it builds on):

```ts
/**
 * Musixmatch's own translation of a track is a literal, in-place rendering of the same body: same
 * blank-line section breaks, same line count per section, in the same order (confirmed by
 * probing). That means it can be paired with the original by position alone — no AI needed —
 * whenever the two actually line up. Returns null (never a best-effort partial pairing) when they
 * don't: a section-count or line-count mismatch means this isn't really a line-for-line rendering
 * of this exact body, and the caller should fall back to an AI translation instead of showing
 * misaligned lines.
 */
export function pairLineAligned(
  originalText: string,
  translatedText: string,
): { label: string; lines: { original: string; translation: string } }[] | null {
  const originalSections = splitIntoSections(originalText);
  const translatedSections = splitIntoSections(translatedText);
  if (originalSections.length === 0 || originalSections.length !== translatedSections.length) {
    return null;
  }

  const paired: { label: string; lines: { original: string; translation: string } }[] = [];
  for (let i = 0; i < originalSections.length; i += 1) {
    const originalLines = originalSections[i].lines;
    const translatedLines = translatedSections[i].lines;
    if (originalLines.length !== translatedLines.length) return null;
    paired.push({
      label: originalSections[i].label,
      lines: originalLines.map((original, j) => ({ original, translation: translatedLines[j] })),
    });
  }
  return paired;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
node --test src/lib/lyrics/musixmatch.test.mts
```
Expected: all 10 tests pass.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/lib/lyrics/musixmatch.ts src/lib/lyrics/musixmatch.test.mts
git commit -m "Add pairLineAligned, zero-AI pairing for Musixmatch's own translation"
```

---

## Task 4: `fetchTranslation` in `musixmatch.ts`

**Files:**
- Modify: `src/lib/lyrics/musixmatch.ts`

**Interfaces:**
- Consumes: `request<T>(path, params)`, `stripNonLyricFooter(body: string): string` (both already private to this file).
- Produces: `export async function fetchTranslation(commontrackId: number, targetLanguage: "en" | "pt"): Promise<MusixmatchLyrics | null>`

This wraps a network call (`track.lyrics.translation.get`), so — matching `fetchLyrics`/`fetchLyricsByTrackId` right above it in this same file — it has no automated test. It's verified manually against the real API in Step 2.

- [ ] **Step 1: Implement it**

Add to `src/lib/lyrics/musixmatch.ts`, directly after `fetchLyricsByTrackId`:

```ts
interface TranslationEnvelope {
  message?: {
    header?: { status_code?: number };
    body?: {
      lyrics?: {
        lyrics_copyright?: string;
        lyrics_translated?: {
          lyrics_body?: string;
          pixel_tracking_url?: string;
          restricted?: number;
        };
      };
    };
  };
}

/**
 * Musixmatch's own translation of a specific recording's lyrics — literal/mechanical, not the
 * officially recorded adapted version (confirmed by probing: asking for Hillsong "Oceans" in `pt`
 * returns a word-for-word rendering, not the real sung "Oceanos"). Coverage is inconsistent too —
 * empty/restricted for less mainstream catalogue entries. So this is a fallback source, never a
 * replacement for finding a real official recording — see generateSongWithAi in openrouter.ts.
 * Returns null on the same conditions as fetchLyrics/fetchLyricsByTrackId: no key, no match,
 * restricted, quota, network trouble.
 */
export async function fetchTranslation(
  commontrackId: number,
  targetLanguage: "en" | "pt",
): Promise<MusixmatchLyrics | null> {
  const payload = await request<TranslationEnvelope>("track.lyrics.translation.get", {
    commontrack_id: String(commontrackId),
    selected_language: targetLanguage,
  });
  if (!payload) return null;

  const status = payload.message?.header?.status_code;
  if (status !== 200) {
    if (status !== 404) console.error(`musixmatch translation status ${status} for commontrack ${commontrackId}`);
    return null;
  }

  const lyrics = payload.message?.body?.lyrics;
  const translated = lyrics?.lyrics_translated;
  const text = stripNonLyricFooter(translated?.lyrics_body ?? "");
  if (!text || translated?.restricted) return null;

  return {
    text,
    copyright: lyrics?.lyrics_copyright?.trim() ?? "",
    trackingPixelUrl: translated?.pixel_tracking_url ?? "",
  };
}
```

- [ ] **Step 2: Verify against the real API**

Create a throwaway script (not part of the repo — delete it after running) to confirm the function behaves as expected on a track known to have a translation and one known not to:

```bash
cat > /tmp/verify_fetch_translation.mjs << 'EOF'
process.loadEnvFile?.("/Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator/.env.local");
const { fetchTranslation } = await import("/Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator/src/lib/lyrics/musixmatch.ts");

const withTranslation = await fetchTranslation(48041966, "pt"); // Oceans — Hillsong Worship
console.log("Oceans -> pt:", withTranslation ? `${withTranslation.text.length} chars, copyright="${withTranslation.copyright}"` : "null");

const withoutTranslation = await fetchTranslation(154684392, "en"); // Estou Te Preparando — Jessé Aguiar
console.log("Estou Te Preparando -> en:", withoutTranslation ? `${withoutTranslation.text.length} chars` : "null (expected)");
EOF
node /tmp/verify_fetch_translation.mjs
rm /tmp/verify_fetch_translation.mjs
```
Expected: the Oceans call returns a non-null result with a few hundred characters of text and a non-empty copyright string; the Jessé Aguiar call returns `null` (this was confirmed restricted/empty when probed earlier in this session — if it now returns non-null that's fine too, just note it in the task's commit message rather than treating it as a failure).

- [ ] **Step 3: Typecheck and commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add src/lib/lyrics/musixmatch.ts
git commit -m "Add fetchTranslation, wrapping track.lyrics.translation.get"
```

---

## Task 5: Restructure the AI pipeline (`schema.ts` + `openrouter.ts`)

**Files:**
- Modify: `src/lib/ai/schema.ts`
- Modify: `src/lib/ai/openrouter.ts`
- Modify: `src/lib/lyrics/musixmatch.ts` (removes `fetchFirstAvailable`, now dead)

**Interfaces:**
- Consumes: `fetchLyricsByTrackId(commontrackId: number): Promise<MusixmatchLyrics | null>`, `fetchTranslation(commontrackId, targetLanguage): Promise<MusixmatchLyrics | null>` (Task 4), `pairLineAligned(originalText, translatedText)` (Task 3), `mapMusixmatchLanguage(tag: string)` (Task 2), `splitIntoSections`, `fetchLyrics`, all from `musixmatch.ts`.
- Produces: `export async function generateSongWithAi(picked: TrackCandidate): Promise<GeneratedSong>` — **signature change**: no more `query` parameter, `picked` is required. Task 6 updates every caller.

This task has no automated tests (same reasoning as Task 4 — every path here calls a live AI API). Its own gate is the typecheck/lint in Step 5; real end-to-end verification against the live APIs happens in Task 8 Step 4 (see the note in Step 6 below for why).

- [ ] **Step 1: Replace `aiIdentifySchema` with `aiOfficialVersionSchema` in `schema.ts`**

Replace (lines 39-61 of `src/lib/ai/schema.ts`):
```ts
/**
 * Step 1 of the generation pipeline: identify the song, and separately decide whether a real,
 * officially recorded version exists in the *other* language — which is a very different question
 * from "can you translate this", and the reason it gets its own call. See generateSongWithAi().
 */
export const aiIdentifySchema = z.object({
  /**
   * Whether the model actually recognises a specific real song here. Defaults to true so a model
   * that just omits the field doesn't break the happy path — assertLooksLikeLyrics() is the real
   * backstop for a model that claims to know a song and then can't produce it.
   */
  found: z.boolean().default(true),
  title: z.string().min(1),
  artist: z.string().default(""),
  originalLanguage: churchLanguageSchema,
  officialVersion: z.object({
    exists: z.boolean(),
    title: z.string().default(""),
    artist: z.string().default(""),
  }),
});

export type AiIdentifyResponse = z.infer<typeof aiIdentifySchema>;
```
with:
```ts
/**
 * Step 1 of the generation pipeline: the song itself is already certain (picked from the
 * catalogue) — this only decides its language and whether a real, officially recorded version
 * exists in the *other* language, which is a very different question from "can you translate
 * this" and the reason it gets its own call. See generateSongWithAi().
 */
export const aiOfficialVersionSchema = z.object({
  originalLanguage: churchLanguageSchema,
  officialVersion: z.object({
    exists: z.boolean(),
    title: z.string().default(""),
    artist: z.string().default(""),
  }),
});

export type AiOfficialVersionResponse = z.infer<typeof aiOfficialVersionSchema>;
```

- [ ] **Step 2: Typecheck to see the fallout in `openrouter.ts`**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: errors in `src/lib/ai/openrouter.ts` about `aiIdentifySchema`/`AiIdentifyResponse` no longer existing. That's expected — Step 3 fixes it.

- [ ] **Step 3: Rewrite `openrouter.ts`**

Change the imports at the top (lines 1-18) from:
```ts
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
```
to:
```ts
import {
  aiOfficialVersionSchema,
  aiLyricsSchema,
  aiRealignSchema,
  aiSongSchema,
  type AiLyricsResponse,
  type AiOfficialVersionResponse,
  type AiRealignResponse,
  type AiSongResponse,
} from "./schema";
import {
  fetchLyrics,
  fetchLyricsByTrackId,
  fetchTranslation,
  mapMusixmatchLanguage,
  pairLineAligned,
  splitIntoSections,
  type MusixmatchLyrics,
  type TrackCandidate,
} from "@/lib/lyrics/musixmatch";
```

`searchTracks` is no longer used in this file (search happens only in `/api/songs/search`, unaffected by this plan) — dropped from the import.

Replace the `IDENTIFY_SYSTEM_PROMPT` constant (lines 24-47) with:
```ts
const IDENTIFY_OFFICIAL_VERSION_SYSTEM_PROMPT = `You are given a specific worship/congregational song recording — its title, artist, and actual lyrics — already confirmed to exist. You are not identifying or choosing a song; it is given. Decide two things about it.

This tool is used by a bilingual church that only ever needs two languages: English and Português (Brasil).

Rules:
- "originalLanguage" is the language the GIVEN lyrics are actually written in — it must be either "English" or "Português (Brasil)". Read the lyrics to decide; don't guess from the title or artist name alone.
- Then consider THE OTHER of the two languages, and decide whether a separate, officially RECORDED version of this song exists in it: a real released recording by a known artist or ministry — not a translation you would produce yourself. This is very common for modern worship: Hillsong, Elevation, Bethel, Passion and Maverick City songs are frequently re-recorded in Português by the same ministry or by a well-known Brazilian artist, with singable adapted lyrics that are NOT literal translations.
- Set officialVersion.exists to true when the search results (or, failing that, your own knowledge) show such a recording really exists and you can name it. If nothing supports one, set it to false — a clean literal translation is far better than an invented "official" version.
- When it exists, give its released title in that language and the artist/ministry that recorded it.
- Web search results are provided to you. Use them: many real songs — especially smaller and recent Brazilian worship releases — will be absent from your own memory but present in the results, and the results are the more reliable source about what exists.
- Respond with ONLY the JSON object below — no markdown code fences, no commentary before or after it. Never address the user, ask a question, or explain yourself: the JSON object is the only thing you may output.

JSON schema:
{
  "originalLanguage": "English" | "Português (Brasil)",
  "officialVersion": { "exists": boolean, "title": string, "artist": string }
}`;
```

Delete the `GENERATE_SYSTEM_PROMPT` constant entirely (the free-text-from-scratch prompt, lines 106-132) — it has no caller left once Step 3 is complete.

Update the constants/messages block (around lines 171-200) — add two new messages next to `UNKNOWN_SONG_MESSAGE`:
```ts
const UNKNOWN_SONG_MESSAGE =
  'Não encontrei a letra dessa música — o modelo não conhece essa gravação. Use "Criar manualmente" e cole a letra nos dois idiomas.';

const RECORDING_UNAVAILABLE_MESSAGE =
  'Essa gravação está indisponível no momento (letra restrita ou não encontrada no catálogo). Escolha outra gravação na busca ou use "Criar manualmente".';

const LANGUAGE_UNKNOWN_MESSAGE =
  'Não foi possível determinar o idioma desta gravação. Tente novamente — se continuar, use "Criar manualmente".';
```

Delete `matchCandidate` entirely (lines 349-354) — with exactly one candidate (the picked one) there's nothing left to match.

Replace `identifySong` (lines 371-384) with `identifyOfficialVersion`:
```ts
/** Step 1: which language is this recording in, and does a real recording of it exist in the other one? */
async function identifyOfficialVersion(
  picked: TrackCandidate,
  originalLyrics: string,
): Promise<AiOfficialVersionResponse> {
  const userPrompt = `Title: "${picked.title}"\nArtist: ${picked.artist || "unknown"}\nLyrics:\n---\n${originalLyrics}\n---`;
  const parsed = await callOpenRouter(IDENTIFY_OFFICIAL_VERSION_SYSTEM_PROMPT, userPrompt, "catalog");
  const result = aiOfficialVersionSchema.safeParse(parsed);
  if (!result.success) {
    throw malformedResponse("identify-official-version", result.error);
  }
  return result.data;
}
```

Simplify `recallLyrics` (lines 386-417) — it's now only ever called for the *official version* side (a title/artist with no `commontrackId`), never for the picked track itself, so drop the `candidates` parameter and its branch entirely:
```ts
/** Step 2: one recording's lyrics, in one language, with nothing translated. */
async function recallLyrics(
  title: string,
  artist: string,
  language: ChurchLanguage,
): Promise<{ lyrics: AiLyricsResponse; attribution: MusixmatchLyrics | null }> {
  const found = await fetchLyrics(title, artist);
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
```

`pairVersions` (lines 419-434) is unchanged — leave it exactly as is.

Replace `generateFromOfficialVersion` (lines 436-474) — the original side no longer needs recalling (it's passed in already fetched), so the `Promise.all` collapses to a single recall call:
```ts
/**
 * The official-recording path: the original side is already fetched (passed in), so only the
 * *official version* needs recalling — then the two are aligned. Recalling and aligning have to
 * be separate steps: asking one call for "the lyrics, already paired line-by-line with the other
 * language" quietly forces a literal translation, because a real adapted recording rarely maps
 * 1:1 onto the original's lines.
 */
async function generateFromOfficialVersion(
  picked: TrackCandidate,
  original: MusixmatchLyrics,
  originalLanguage: ChurchLanguage,
  officialVersion: { title: string; artist: string },
): Promise<GeneratedSong> {
  const targetLanguage = otherLanguage(originalLanguage);
  const originalSide: AiLyricsResponse = { sections: splitIntoSections(original.text) };

  const officialSide = await recallLyrics(officialVersion.title || picked.title, officialVersion.artist, targetLanguage);

  const paired = await pairVersions(originalSide, officialSide.lyrics, originalLanguage, targetLanguage);

  return {
    song: {
      title: picked.title,
      artist: picked.artist,
      originalLanguage,
      translationLanguage: targetLanguage,
      isOfficialTranslation: true,
      sections: paired.sections,
    },
    // Both sides can carry Musixmatch attribution, each with its own notice and view counter.
    attribution: combineAttribution([original, officialSide.attribution]),
  };
}
```

Replace `translateSong` (lines 476-525) with `translateKnownLyrics` — drops the free-generation fallback entirely, and tries Musixmatch's own translation before the AI literal translation:
```ts
/**
 * The fallback path: no official recording exists (or that path failed). Tries Musixmatch's own
 * translation of this exact recording first — it's free and, when it exists and lines up, exactly
 * as accurate as a literal translation needs to be (see fetchTranslation/pairLineAligned). Only
 * asks the model to translate when Musixmatch has nothing usable.
 */
async function translateKnownLyrics(
  picked: TrackCandidate,
  original: MusixmatchLyrics,
  originalLanguage: ChurchLanguage,
): Promise<GeneratedSong> {
  const targetLanguage = otherLanguage(originalLanguage);
  const targetCode = originalLanguage === "English" ? "pt" : "en";

  const translated = await fetchTranslation(picked.commontrackId, targetCode);
  const paired = translated ? pairLineAligned(original.text, translated.text) : null;
  if (paired) {
    return {
      song: {
        title: picked.title,
        artist: picked.artist,
        originalLanguage,
        translationLanguage: targetLanguage,
        isOfficialTranslation: false,
        sections: paired,
      },
      attribution: combineAttribution([original, translated]),
    };
  }

  const userPrompt = `These are the ${originalLanguage} lyrics of ${describe(picked.title, picked.artist)}. Translate them into ${targetLanguage}.\n---\n${original.text}\n---`;
  const parsed = await callOpenRouter(STRUCTURE_TRANSLATE_SYSTEM_PROMPT, userPrompt);
  assertNotEmptyAnswer(parsed);
  const result = aiRealignSchema.safeParse(parsed);
  if (!result.success) {
    throw malformedResponse("translate", result.error);
  }
  return {
    song: {
      title: picked.title,
      artist: picked.artist,
      originalLanguage,
      translationLanguage: targetLanguage,
      isOfficialTranslation: false,
      sections: result.data.sections,
    },
    attribution: combineAttribution([original]),
  };
}
```

Replace `generateSongWithAi` (lines 527-575) — the exported entry point:
```ts
export async function generateSongWithAi(picked: TrackCandidate): Promise<GeneratedSong> {
  // The picked recording settles "which song" outright — everything below is about language and
  // translation, never about finding or confirming the song itself.
  const original = await fetchLyricsByTrackId(picked.commontrackId);
  if (!original) {
    throw new OpenRouterUnknownSongError(RECORDING_UNAVAILABLE_MESSAGE);
  }

  let meta: AiOfficialVersionResponse | null = null;
  try {
    meta = await identifyOfficialVersion(picked, original.text);
  } catch (error) {
    // A failed/unparseable identification still leaves a real, usable original lyric — degrade to
    // Musixmatch's own language tag rather than failing the whole generation.
    console.error("official-version identification failed, falling back to catalogue language tag", error);
  }

  const originalLanguage = meta?.originalLanguage ?? mapMusixmatchLanguage(picked.language);
  if (!originalLanguage) {
    throw new OpenRouterResponseError(LANGUAGE_UNKNOWN_MESSAGE);
  }
  const officialVersion = meta?.officialVersion ?? { exists: false, title: "", artist: "" };

  if (officialVersion.exists) {
    try {
      const generated = await generateFromOfficialVersion(picked, original, originalLanguage, officialVersion);
      const result = aiSongSchema.safeParse(generated.song);
      if (result.success) {
        assertLooksLikeLyrics(result.data);
        return { song: result.data, attribution: generated.attribution };
      }
      console.error("official-version result failed validation", result.error);
    } catch (error) {
      // An official version we can't actually retrieve or align is worse than a clean fallback
      // translation, so every failure here degrades to the path below.
      console.error("official-version path failed, falling back to translation", error);
    }
  }

  const generated = await translateKnownLyrics(picked, original, originalLanguage);
  assertLooksLikeLyrics(generated.song);
  return generated;
}
```

- [ ] **Step 4: Remove the now-dead `fetchFirstAvailable` from `musixmatch.ts`**

Delete this whole function from `src/lib/lyrics/musixmatch.ts` (it only existed to walk multiple candidates; every caller now fetches one exact `commontrackId`):
```ts
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
```

- [ ] **Step 5: Typecheck and lint**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint src/lib/ai/schema.ts src/lib/ai/openrouter.ts src/lib/lyrics/musixmatch.ts
```
Expected: clean. Fix anything that surfaces (a stray reference to a deleted symbol, an unused import) before moving on — `generate-song/route.ts` will still fail here (it calls `generateSongWithAi(query, picked)`), that's expected and fixed in Task 6, not this one.

- [ ] **Step 6: Note on end-to-end verification**

`openrouter.ts` imports via the `@/` path alias and extensionless relative specifiers (`"./schema"`) — both resolved by Next.js's bundler, neither resolvable by plain `node` the way `musixmatch.ts` was in Task 4 (that file has zero imports, which is why that trick worked there). Don't fight this with a custom Node loader here — `generateSongWithAi` gets its real end-to-end verification in Task 8 Step 4, through the actual running app, exactly like the rest of this codebase's AI pipeline always has been (see the commit history of this file: "no key reaches OpenRouter through this sandbox — so the 'does it actually find Oceanos' test is still yours to run"). This task's own gate is Step 5's typecheck/lint, which does catch real mistakes (wrong types, wrong property names, dead imports) even without exercising the network calls.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai/schema.ts src/lib/ai/openrouter.ts src/lib/lyrics/musixmatch.ts
git commit -m "Trim the AI pipeline now that the song is always certain

Replaces identifySong (find-the-song-and-decide) with
identifyOfficialVersion (decide-language-and-official-version-only,
song already known). Adds a Musixmatch-translation fallback ahead of
the AI literal translation. Removes the free-generation path and the
multi-candidate machinery uncertainty used to need."
```

---

## Task 6: Require `picked` end to end (`route.ts` + `useGenerateSong.ts`)

**Files:**
- Modify: `src/app/api/generate-song/route.ts`
- Modify: `src/lib/useGenerateSong.ts`

**Interfaces:**
- Consumes: `generateSongWithAi(picked: TrackCandidate): Promise<GeneratedSong>` (Task 5).
- Produces: `useGenerateSong().generate(picked: TrackCandidate): Promise<{ id: string } | { error: string }>` — **signature change**, `query` dropped. Task 7 updates its one caller.

- [ ] **Step 1: Update the request schema and handler in `route.ts`**

Replace the whole file:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { aiResponseToSong } from "@/lib/ai/toSong";
import {
  generateSongWithAi,
  OpenRouterConfigError,
  OpenRouterResponseError,
  OpenRouterUnknownSongError,
} from "@/lib/ai/openrouter";

const requestSchema = z.object({
  picked: z.object({
    commontrackId: z.number(),
    title: z.string(),
    artist: z.string(),
    language: z.string().default(""),
    trackRating: z.number().default(0),
  }),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requisição inválida." }, { status: 400 });
  }

  try {
    const { song: aiResponse, attribution } = await generateSongWithAi(parsed.data.picked);
    const song = aiResponseToSong(aiResponse, attribution);
    return NextResponse.json({ song });
  } catch (error) {
    if (error instanceof OpenRouterConfigError) {
      return NextResponse.json({ error: error.message }, { status: 501 });
    }
    if (error instanceof OpenRouterUnknownSongError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof OpenRouterResponseError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("generate-song failed", error);
    return NextResponse.json({ error: "Algo deu errado ao gerar esta música. Tente novamente." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Update `generate` in `useGenerateSong.ts`**

Replace (lines 47-67):
```ts
  const generate = async (query: string, picked?: TrackCandidate): Promise<{ id: string } | { error: string }> => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      return { error: "Digite o título de uma música, um trecho da letra ou uma breve descrição." };
    }
    try {
      const res = await fetch("/api/generate-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, picked }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Algo deu errado.");
      }
      const id = createSong(data.song as Song);
      return { id };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Algo deu errado." };
    }
  };
```
with:
```ts
  const generate = async (picked: TrackCandidate): Promise<{ id: string } | { error: string }> => {
    try {
      const res = await fetch("/api/generate-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picked }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Algo deu errado.");
      }
      const id = createSong(data.song as Song);
      return { id };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Algo deu errado." };
    }
  };
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: errors only in `src/components/studio/NewSongDialog.tsx` now (still calling the old `generate(trimmed, picked)` signature) — that's Task 7.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/generate-song/route.ts src/lib/useGenerateSong.ts
git commit -m "Require picked end to end: drop query from generate-song"
```

---

## Task 7: Update `NewSongDialog.tsx`

**Files:**
- Modify: `src/components/studio/NewSongDialog.tsx`

**Interfaces:**
- Consumes: `useGenerateSong().generate(picked: TrackCandidate)` (Task 6), `useGenerateSong().search(query: string)` (unchanged).

- [ ] **Step 1: Replace the whole file**

```tsx
"use client";

import { useState } from "react";
import { Loader2, PenLine, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { useLibraryStore } from "@/lib/store";
import { useGenerateSong } from "@/lib/useGenerateSong";
import { useGenerationStore } from "@/lib/generationStore";
import type { TrackCandidate } from "@/lib/lyrics/musixmatch";

const MIN_QUERY_LENGTH = 2;

interface NewSongDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * null = nothing searched yet; an array = a search that ran. Empty covers both "found nothing"
 * and "catalogue not configured" — either way, only "Criar manualmente" is left as an option.
 */
type Results = TrackCandidate[] | null;

export function NewSongDialog({ open, onClose }: NewSongDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createSong = useLibraryStore((s) => s.createSong);
  const { generate, search } = useGenerateSong();
  const startGeneration = useGenerationStore((s) => s.start);
  const failGeneration = useGenerationStore((s) => s.fail);
  const finishGeneration = useGenerationStore((s) => s.finish);

  const canSubmit = query.trim().length >= MIN_QUERY_LENGTH;

  const reset = () => {
    setQuery("");
    setResults(null);
    setError(null);
    setSearching(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleManual = () => {
    createSong({ mode: "manual" });
    handleClose();
  };

  const handleSearch = async () => {
    if (!canSubmit || searching) return;
    setSearching(true);
    setError(null);
    const outcome = await search(query);
    setSearching(false);

    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    // Unconfigured and "found nothing" both land here on purpose: either way, picking a
    // recording isn't possible, and the empty-results message below already points at
    // "Criar manualmente".
    setResults(outcome.results);
  };

  const handleGenerate = async (picked: TrackCandidate) => {
    // Hand off to the full-screen overlay and close, rather than holding the dialog open with a
    // spinner in it — generation takes seconds and the main window is where the result lands.
    startGeneration(`${picked.title}${picked.artist ? ` — ${picked.artist}` : ""}`);
    handleClose();

    const result = await generate(picked);
    if ("id" in result) {
      finishGeneration();
    } else {
      failGeneration(result.error);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Nova música">
      <div className="space-y-4">
        <div>
          <Label htmlFor="ai-query">Título da música ou um trecho da letra</Label>
          <div className="flex gap-2">
            <Input
              id="ai-query"
              autoFocus
              placeholder={'ex.: "Oceans do Hillsong" ou "estou preparando um caminho"'}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // The old results describe the old query; keeping them on screen would invite
                // picking a recording that has nothing to do with what's now typed.
                setResults(null);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
            />
            <Button onClick={handleSearch} disabled={!canSubmit || searching}>
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Buscar
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-ink/45">
            A busca procura tanto no título quanto dentro da letra.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {results !== null && results.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-ink/60">Escolha a gravação:</p>
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {results.map((track) => (
                <li key={track.commontrackId}>
                  <button
                    onClick={() => void handleGenerate(track)}
                    className="flex w-full items-baseline justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{track.title}</span>
                      <span className="block truncate text-xs text-ink/55">
                        {track.artist || "artista desconhecido"}
                      </span>
                    </span>
                    {track.language && (
                      <span className="shrink-0 text-[13px] uppercase text-ink/40">{track.language}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {results !== null && results.length === 0 && (
          <p className="text-sm text-ink/55">Nada encontrado no catálogo. Crie manualmente.</p>
        )}

        <Button variant="secondary" onClick={handleManual} className="w-full">
          <PenLine size={16} />
          Criar manualmente
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint src/components/studio/NewSongDialog.tsx
```
Expected: both clean — this was the last file with a stale caller.

- [ ] **Step 3: Commit**

```bash
git add src/components/studio/NewSongDialog.tsx
git commit -m "Remove free-text AI generation from the Nova música dialog

Picking a recording (or Criar manualmente) is now the only way in —
matches useGenerateSong().generate() requiring a TrackCandidate."
```

---

## Task 8: Full-repo verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck, lint, and run the unit tests**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint .
node --test src/lib/lyrics/musixmatch.test.mts
```
Expected: all clean/passing.

- [ ] **Step 2: Confirm no leftover references to anything removed in this plan**

```bash
grep -rn "aiIdentifySchema\|AiIdentifyResponse\|identifySong\|matchCandidate\|fetchFirstAvailable\|GENERATE_SYSTEM_PROMPT\|IDENTIFY_SYSTEM_PROMPT\b\|translateSong\b\|quick-add\|quickAdd\|QuickAdd" src src-tauri --include="*.ts" --include="*.tsx" --include="*.rs" --include="*.json"
```
Expected: no output.

- [ ] **Step 3: `cargo check` the desktop shell**

```bash
cd src-tauri && cargo check && cd ..
```
Expected: clean.

- [ ] **Step 4: Manual smoke test in the browser**

```bash
npm run dev
```
Then, in a browser:
1. Open the app, click "Nova música". Confirm there is only "Buscar" + "Criar manualmente" — no "Gerar com IA" button.
2. Search "Oceans Hillsong", pick the Hillsong UNITED recording. Confirm generation completes; check the resulting song's language pair and `isOfficialTranslation` flag (visible in the editor/attribution UI) — this is the branch most likely to have a real official recording, so it's the best real check that `identifyOfficialVersion` → `generateFromOfficialVersion` actually works end to end against the live APIs.
3. Search "estou preparando um caminho", pick "Estou Te Preparando" — Jessé Aguiar. Confirm generation completes with `isOfficialTranslation: false` and real English lyrics; this exercises `translateKnownLyrics` (Musixmatch-translation-or-AI-literal fallback).
4. Search for something that returns no catalogue matches (e.g. random gibberish). Confirm the dialog shows "Nada encontrado no catálogo. Crie manualmente." and there is no way to generate from that empty state other than manual creation.
5. Confirm "Criar manualmente" still opens a blank manual editor as before.

Expected: all five behave as described. If step 2 or 3 fails, check the terminal running `npm run dev` for the actual thrown error — it's more informative than the toast/UI error text.

- [ ] **Step 5: Final commit (only if Step 4 required fixes)**

If everything passed with no changes needed, there's nothing to commit here. If a fix was needed during manual testing, commit it with a message describing what was actually wrong (not "final fixes").
