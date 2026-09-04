# ProPresenter Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user import an existing ProPresenter `.pro` file (from any library on disk, not just the one currently selected in Ajustes) and land on the normal song editor with its lyrics extracted — the inverse of the app's existing export flow.

**Architecture:** Two new desktop-gated Next.js API routes handle all filesystem/decode work server-side (matching how export already works — the Node sidecar has real disk access, the client just calls `fetch`). Decoding reuses the existing vendored ProPresenter 7 protobuf schema (`getPresentationType()`) symmetrically to how `encode.ts` already writes it. A new RTF-to-plain-text extractor and a small two-language (pt/en) heuristic classifier turn decoded slide text into `languageA`/`languageB` raw strings, which then feed the **existing** `buildAlignmentFromManual()` — no new alignment-building code needed. A small AI call (reusing the existing cheap-model pattern from `identifyLanguageOnly()`) resolves only the lines the heuristic can't confidently classify.

**Tech Stack:** Next.js API routes, `protobufjs` (already a dependency), the existing OpenRouter integration (`src/lib/ai/openrouter.ts`), Node `fs/promises`, no new npm dependencies.

**Spec:** None written — user explicitly asked to skip straight from brainstorming to this plan. The design was worked out conversationally (including two feasibility spikes against real `.pro` files: `/Users/guilhermetoti/Desktop/Abba.pro` and `/Users/guilhermetoti/Desktop/Jesus We Love You.pro`) in the same session that produced this plan. Load that conversation for full context if anything here is ambiguous.

## Global Constraints

- Desktop-only feature: every new route must 404 when `isDesktopServer()` (see `src/lib/desktop/envFile.ts`) is false, matching the existing `/api/settings/*` routes' convention.
- No new npm dependencies — decode reuses `protobufjs` (already installed) and the RTF extractor is hand-rolled, matching this repo's existing hand-rolled RTF *writer* (`src/lib/propresenter/rtf.ts`) rather than pulling in a third-party RTF library.
- No test framework exists in this repo (confirmed: no test script in `package.json`, no test files anywhere). Every task's "test" step is a real manual verification — either a `npx tsx` script run against the two real fixture files, or `npm run dev` + a real HTTP/browser check — never a claim without a command actually run.
- Reuse existing code wherever it already does the job: `buildAlignmentFromManual()` for alignment, `createEmptySong()` for the final `Song` object, `useLibraryStore().startSong()` for landing on the editor, `LANGUAGE_ONLY_MODEL` for the AI fallback's model choice.
- Portuguese is always `languageA`, English is always `languageB` — this is an existing, unconditional convention throughout the app (see `EditorPanel` and `LanguageSourceCard`'s hardcoded "Português"/"Inglês" labels); do not introduce a different convention for imported songs.
- Fixture files for manual verification (already used during the spike, keep using them): `/Users/guilhermetoti/Desktop/Abba.pro` (single-language, Portuguese, 1 text element per cue, some cues have 2 lines) and `/Users/guilhermetoti/Desktop/Jesus We Love You.pro` (bilingual, both languages stacked as separate lines within one text element per cue — confirmed real decoded output for one cue is `["Nosso afeto", "Our affection"]`).

---

## Task 1: RTF-to-plain-text extractor

**Files:**
- Create: `src/lib/propresenter/rtfText.ts`

**Interfaces:**
- Consumes: nothing from other tasks (pure function, first task in the chain).
- Produces: `rtfToPlainText(rtf: string): string` — used by Task 4 (decode.ts).

**Context:** ProPresenter's own RTF (confirmed by decoding both real fixture files directly during the spike) uses the same `\uNNNN?` Unicode-escape and `\par` paragraph-break convention this repo's existing RTF *writer* (`src/lib/propresenter/rtf.ts`) already produces — but the formatting preamble before real text (font table, color table, list table, paragraph controls) varies in field order and presence between files, so a fixed-order regex (like the throwaway one used during the spike, which left stray artifacts such as a leftover `"cb2 "` prefix on real content) is not robust enough to ship. This task writes a real minimal RTF tokenizer: walk the string once, track brace depth, skip the *content* of any group that's a known non-text "destination" (font/color/list tables, or anything RTF's own `\*` ignorable-destination prefix marks) regardless of where it appears or what order it's in, and only emit real paragraph text.

- [ ] **Step 1: Write the extractor**

```typescript
// src/lib/propresenter/rtfText.ts

/**
 * Destination groups that never contain real document text — skipped
 * regardless of field order, since real ProPresenter exports were confirmed
 * (via two real decoded .pro files) to vary in which of these appear and in
 * what order before the actual paragraph content.
 */
const IGNORED_DESTINATIONS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "listtable",
  "listoverridetable",
  "info",
  "generator",
  "expandedcolortbl",
  "latentstyles",
  "rsidtbl",
  "themedata",
  "colorschememapping",
  "panose",
  "objdata",
  "pict",
]);

/**
 * Minimal RTF-to-plain-text extractor for the paragraph text embedded in a
 * ProPresenter `Graphics.Text.rtf_data` payload (see decode.ts). Not a
 * general-purpose RTF renderer — extracts plain text and paragraph breaks
 * only, silently dropping all formatting. Mirrors (in reverse) the exact
 * escape conventions `rtf.ts`'s `buildLyricsRtf`/`escapeRtfText` produce,
 * which that file's own doc comment says were verified against a real
 * decoded .pro file — this extractor was verified the same way, against two.
 */
export function rtfToPlainText(rtf: string): string {
  let i = 0;
  const n = rtf.length;
  const paragraphs: string[] = [];
  let current = "";

  // One entry per open brace: true if this group's content should be dropped
  // (either it's itself an ignored destination, or an ancestor group is).
  const skipStack: boolean[] = [];
  const isSkipping = () => skipStack.length > 0 && skipStack[skipStack.length - 1];

  function flushParagraph() {
    paragraphs.push(current);
    current = "";
  }

  while (i < n) {
    const ch = rtf[i];

    if (ch === "{") {
      let j = i + 1;
      let ignorable = isSkipping(); // inherit: a group inside a skipped group is also skipped
      if (!ignorable) {
        let k = j;
        if (rtf[k] === "\\" && rtf[k + 1] === "*") {
          ignorable = true;
          k += 2;
        }
        if (!ignorable && rtf[k] === "\\") {
          const match = /^\\([a-zA-Z]+)/.exec(rtf.slice(k));
          if (match && IGNORED_DESTINATIONS.has(match[1])) ignorable = true;
        }
      }
      skipStack.push(ignorable);
      i += 1;
      continue;
    }

    if (ch === "}") {
      skipStack.pop();
      i += 1;
      continue;
    }

    if (ch === "\\") {
      // Escaped literal brace or backslash.
      const next = rtf[i + 1];
      if (next === "{" || next === "}" || next === "\\") {
        if (!isSkipping()) current += next;
        i += 2;
        continue;
      }

      // \'XX hex-escaped byte (Windows-1252/Latin-1 range).
      const hexMatch = /^\\'([0-9a-fA-F]{2})/.exec(rtf.slice(i));
      if (hexMatch) {
        i += hexMatch[0].length;
        if (!isSkipping()) current += String.fromCharCode(parseInt(hexMatch[1], 16));
        continue;
      }

      // Control word, optionally with a signed numeric argument and one
      // optional trailing space consumed as a delimiter (standard RTF).
      const wordMatch = /^\\([a-zA-Z]+)(-?\d+)?( )?/.exec(rtf.slice(i));
      if (wordMatch) {
        const [full, word, numArg] = wordMatch;
        i += full.length;
        if (isSkipping()) continue;

        if (word === "par" || word === "line") {
          flushParagraph();
        } else if (word === "tab") {
          current += "\t";
        } else if (word === "u" && numArg !== undefined) {
          let code = parseInt(numArg, 10);
          if (code < 0) code += 65536;
          current += String.fromCharCode(code);
          // RTF always follows \uN with exactly one fallback character for
          // readers that can't do Unicode (this repo's own writer, and every
          // real file decoded during the spike, use "?") — skip it so it
          // doesn't leak into the extracted text.
          if (rtf[i] === "?") i += 1;
        }
        // Every other control word is pure formatting — silently dropped.
        continue;
      }

      // Unrecognized escape — skip just the backslash so the loop still progresses.
      i += 1;
      continue;
    }

    if (!isSkipping()) current += ch;
    i += 1;
  }
  flushParagraph();

  return paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n");
}
```

- [ ] **Step 2: Verify against the real fixture files**

Run:

```bash
cd /Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator
cat > /tmp/verify-rtf.mjs << 'EOF'
import { getPresentationType } from "./src/lib/propresenter/schema.ts";
import { rtfToPlainText } from "./src/lib/propresenter/rtfText.ts";
import fs from "node:fs";

const Presentation = await getPresentationType();

for (const file of ["/Users/guilhermetoti/Desktop/Abba.pro", "/Users/guilhermetoti/Desktop/Jesus We Love You.pro"]) {
  const buf = fs.readFileSync(file);
  const obj = Presentation.toObject(Presentation.decode(buf), { longs: String, bytes: Buffer });
  console.log(`\n=== ${file} ===`);
  for (const cue of obj.cues.slice(0, 6)) {
    const elements = cue?.actions?.[0]?.slide?.presentation?.baseSlide?.elements ?? [];
    for (const el of elements) {
      const rtf = el.element?.text?.rtfData?.toString("utf-8");
      if (rtf) console.log(JSON.stringify(rtfToPlainText(rtf)));
    }
  }
}
EOF
cp /tmp/verify-rtf.mjs ./verify-rtf.mjs
npx tsx verify-rtf.mjs
rm -f ./verify-rtf.mjs /tmp/verify-rtf.mjs
```

Expected: clean lyric lines with no stray control-word fragments (no `"cb2 "`, no `"fonttbl"`, no brace characters) — e.g. for Abba.pro you should see lines like `"Estou preparando um caminho"` (if this is cue 0's title/artist slide, expect `"Abba"` and `"Laura Souguellis"` on separate lines), and for Jesus We Love You.pro you should see two-line entries like `"Nosso afeto\nOur affection"`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/propresenter/rtfText.ts
git commit -m "$(cat <<'EOF'
Add RTF-to-plain-text extractor for ProPresenter import

A real (non-regex-hack) tokenizer that skips font/color/list table groups
regardless of field order — confirmed necessary by decoding two real .pro
files, whose formatting preambles differ in field order before the same
\uNNNN? escape convention this repo's own RTF writer already uses.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QshjjPA6vQbKNFeXecjbbP
EOF
)"
```

---

## Task 2: Two-language (pt/en) line classifier

**Files:**
- Create: `src/lib/propresenter/languageDetect.ts`

**Interfaces:**
- Consumes: nothing from other tasks (pure functions, plain strings in).
- Produces: `detectLine(text: string): "pt" | "en" | "ambiguous"`, `classifyCueLines(cueLines: string[][]): { isBilingual: boolean; dominantLanguage: "pt" | "en"; lineTags: ("pt" | "en" | "ambiguous")[][] }`, `buildRawTextFromTags(cueLines: string[][], tags: ("pt" | "en")[][], isBilingual: boolean, dominantLanguage: "pt" | "en"): { languageA: string; languageB: string }` — all used by Task 5 (importSong.ts).

**Context:** This is the layered approach the user explicitly approved over "always call AI": a cheap per-line heuristic (Portuguese diacritics + common-stopword scoring — tuned for exactly these two known languages, not general language ID) decides most lines outright; only genuinely ambiguous lines fall through to AI (Task 3), and only when the song is bilingual at all (a single-language song never needs per-line splitting). `classifyCueLines` decides "bilingual or not" at the whole-song level by aggregating line-level tags — this is what correctly handles a single-language song with a 2-line verse (both lines detect the same language, so nothing gets incorrectly split).

- [ ] **Step 1: Write the classifier**

```typescript
// src/lib/propresenter/languageDetect.ts

export type LineLanguage = "pt" | "en" | "ambiguous";

const PT_DIACRITICS = /[ãõáàâéêíóôúçÃÕÁÀÂÉÊÍÓÔÚÇ]/;

const PT_STOPWORDS = new Set([
  "que", "não", "com", "uma", "um", "para", "você", "está", "são", "meu", "minha",
  "teu", "tua", "seu", "sua", "nosso", "nossa", "eu", "ele", "ela", "nós", "de", "da",
  "do", "das", "dos", "em", "na", "no", "nas", "nos", "é", "era", "será", "como", "mais",
  "muito", "tudo", "nada", "aqui", "ali", "lá", "sim", "porque", "quando", "onde",
  "vou", "vem", "vamos", "seja", "quero", "posso", "temos", "tenho", "só", "já",
]);

const EN_STOPWORDS = new Set([
  "the", "and", "of", "to", "is", "you", "your", "are", "my", "his", "her", "our", "we",
  "he", "she", "they", "in", "on", "at", "for", "with", "this", "that", "was", "will",
  "be", "have", "has", "do", "does", "not", "all", "everything", "nothing", "here",
  "there", "yes", "no", "because", "when", "where", "more", "very", "am", "us", "me",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}']+/u)
    .filter(Boolean);
}

/**
 * Classifies a single line as Portuguese, English, or ambiguous — tuned for
 * exactly these two known languages, not general language identification.
 * Diacritics are a near-conclusive signal when present (English essentially
 * never uses ã/õ/ç); their absence proves nothing, since plenty of Portuguese
 * words lack them ("que", "de", "amor"), which is why stopword scoring is the
 * fallback rather than the primary signal.
 */
export function detectLine(text: string): LineLanguage {
  const trimmed = text.trim();
  if (!trimmed) return "ambiguous";

  if (PT_DIACRITICS.test(trimmed)) return "pt";

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return "ambiguous";

  let ptScore = 0;
  let enScore = 0;
  for (const token of tokens) {
    if (PT_STOPWORDS.has(token)) ptScore += 1;
    if (EN_STOPWORDS.has(token)) enScore += 1;
  }

  if (ptScore === 0 && enScore === 0) return "ambiguous";
  if (ptScore === enScore) return "ambiguous";
  return ptScore > enScore ? "pt" : "en";
}

export interface CueClassification {
  isBilingual: boolean;
  dominantLanguage: "pt" | "en";
  lineTags: LineLanguage[][];
}

/** At least this fraction of confidently-tagged lines must be the minority
 * language before the whole song is treated as bilingual — guards against a
 * single stray misclassified line flipping an otherwise single-language song. */
const BILINGUAL_MIX_THRESHOLD = 0.15;

export function classifyCueLines(cueLines: string[][]): CueClassification {
  const lineTags = cueLines.map((lines) => lines.map(detectLine));
  const flat = lineTags.flat();
  const ptCount = flat.filter((t) => t === "pt").length;
  const enCount = flat.filter((t) => t === "en").length;
  const confidentTotal = ptCount + enCount;

  const dominantLanguage: "pt" | "en" = ptCount >= enCount ? "pt" : "en";

  if (confidentTotal === 0) {
    return { isBilingual: false, dominantLanguage, lineTags };
  }

  const minorityCount = Math.min(ptCount, enCount);
  const isBilingual = minorityCount / confidentTotal >= BILINGUAL_MIX_THRESHOLD;

  return { isBilingual, dominantLanguage, lineTags };
}

/**
 * Builds languageA (Portuguese)/languageB (English) raw text — one block per
 * cue, blank-line separated, matching the format buildAlignmentFromManual()
 * (src/lib/alignment.ts) already expects for manually-pasted lyrics. `tags`
 * must be fully resolved ("pt"/"en" only, no "ambiguous") — resolve those via
 * the AI fallback (Task 3) before calling this.
 */
export function buildRawTextFromTags(
  cueLines: string[][],
  tags: ("pt" | "en")[][],
  isBilingual: boolean,
  dominantLanguage: "pt" | "en",
): { languageA: string; languageB: string } {
  const ptBlocks: string[] = [];
  const enBlocks: string[] = [];

  cueLines.forEach((lines, cueIndex) => {
    if (!isBilingual) {
      const block = lines.join("\n");
      (dominantLanguage === "pt" ? ptBlocks : enBlocks).push(block);
      return;
    }

    const cueTags = tags[cueIndex];
    const ptLines = lines.filter((_, i) => cueTags[i] === "pt");
    const enLines = lines.filter((_, i) => cueTags[i] === "en");
    if (ptLines.length > 0) ptBlocks.push(ptLines.join("\n"));
    if (enLines.length > 0) enBlocks.push(enLines.join("\n"));
  });

  return {
    languageA: ptBlocks.join("\n\n"),
    languageB: enBlocks.join("\n\n"),
  };
}
```

- [ ] **Step 2: Verify against the real fixture files**

This needs Task 1 and Task 4 (decode.ts) to run against real cue text, but the core classifier can be sanity-checked standalone first:

```bash
cd /Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator
cat > /tmp/verify-lang.mjs << 'EOF'
import { detectLine, classifyCueLines } from "./src/lib/propresenter/languageDetect.ts";

console.log(detectLine("Estou preparando um caminho")); // expect "pt"
console.log(detectLine("Amazing grace how sweet the sound")); // expect "en"
console.log(detectLine("Nosso afeto")); // expect "pt"
console.log(detectLine("Our affection")); // expect "en"
console.log(detectLine("Ah")); // expect "ambiguous"

const single = classifyCueLines([["Estou preparando um caminho"], ["Endireitando as veredas", "E cada vez mais diminuindo"]]);
console.log("single-language song:", single.isBilingual, single.dominantLanguage); // expect false, "pt"

const bilingual = classifyCueLines([["Nosso afeto", "Our affection"], ["Nossa devoção", "Our devotion"]]);
console.log("bilingual song:", bilingual.isBilingual, bilingual.dominantLanguage); // expect true
EOF
cp /tmp/verify-lang.mjs ./verify-lang.mjs
npx tsx verify-lang.mjs
rm -f ./verify-lang.mjs /tmp/verify-lang.mjs
```

Expected: matches the comments above exactly. If `detectLine("Ah")` doesn't come back `"ambiguous"`, or either song-level check comes back wrong, fix the heuristic before moving on — Task 5's fallback logic depends on these being correct.

- [ ] **Step 3: Commit**

```bash
git add src/lib/propresenter/languageDetect.ts
git commit -m "$(cat <<'EOF'
Add pt/en line classifier for ProPresenter import

Layered heuristic (Portuguese diacritics + stopword scoring) the user
explicitly chose over always calling AI — most real files resolve without
any AI cost; genuinely ambiguous lines are left tagged for the AI fallback.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QshjjPA6vQbKNFeXecjbbP
EOF
)"
```

---

## Task 3: AI fallback for ambiguous lines

**Files:**
- Modify: `src/lib/ai/schema.ts`
- Modify: `src/lib/ai/openrouter.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `classifyLineLanguages(lines: string[], signal?: AbortSignal): Promise<("pt" | "en")[]>` — used by Task 5 (importSong.ts). Resolves to an array the same length as `lines`, same order.

**Context:** Follows the existing minimal/cheap-model pattern already used for `identifyLanguageOnly()` (same file) — not the heavier realign/translate-literally prompts, which do full reconciliation/translation. This call only classifies; it never rewrites text.

- [ ] **Step 1: Add the schema**

In `src/lib/ai/schema.ts`, add near the other small schemas (after `aiLanguageSchema`):

```typescript
/**
 * classifyLineLanguages()'s response — used only for lines the pt/en
 * heuristic in languageDetect.ts couldn't confidently tag on its own.
 */
export const aiLineLanguagesSchema = z.object({
  tags: z.array(z.enum(["pt", "en"])),
});

export type AiLineLanguagesResponse = z.infer<typeof aiLineLanguagesSchema>;
```

- [ ] **Step 2: Add the prompt and function**

In `src/lib/ai/openrouter.ts`, add the import at the top (extend the existing `from "./schema"` import):

```typescript
import {
  aiLanguageSchema,
  aiLineLanguagesSchema,
  aiLiteralTranslationSchema,
  aiRealignWireSchema,
  expandWireSections,
  type AiRealignResponse,
  type AiSongResponse,
} from "./schema";
```

Then add the prompt near `IDENTIFY_LANGUAGE_SYSTEM_PROMPT` and the function near `identifyLanguageOnly()`:

```typescript
/**
 * Used only for lines the pt/en heuristic in languageDetect.ts couldn't
 * confidently classify on its own (see classifyLineLanguages()) — a real
 * imported .pro's blank/very short lines, not a translation task.
 */
const CLASSIFY_LINES_SYSTEM_PROMPT = `You are given a numbered list of short lines from song lyrics. Classify each line as either "pt" (Português) or "en" (English) — every line must get one of these two tags, even a short or ambiguous-looking one; make your best guess rather than refusing.

This tool is used by a bilingual church that only ever needs these two languages.

Respond with ONLY the JSON object below — no markdown code fences, no commentary before or after it. The "tags" array must have exactly as many entries as lines given, in the same order.

JSON schema:
{
  "tags": ["pt" | "en", ...]
}`;

/** Resolves only the lines languageDetect.ts's heuristic tagged "ambiguous" — see its own doc
 * comment for why this two-tier approach exists instead of always calling AI. */
export async function classifyLineLanguages(lines: string[], signal?: AbortSignal): Promise<("pt" | "en")[]> {
  if (lines.length === 0) return [];
  const userPrompt = lines.map((line, i) => `${i + 1}. ${line}`).join("\n");
  const parsed = await callOpenRouter(CLASSIFY_LINES_SYSTEM_PROMPT, userPrompt, LANGUAGE_ONLY_MODEL, signal);
  const result = aiLineLanguagesSchema.safeParse(parsed);
  if (!result.success) {
    throw malformedResponse("classify-line-languages", result.error);
  }
  if (result.data.tags.length !== lines.length) {
    throw new OpenRouterResponseError("A IA retornou uma quantidade de resultados diferente da esperada.");
  }
  return result.data.tags;
}
```

- [ ] **Step 3: Verify it compiles and runs against a real (small, cheap) call**

```bash
cd /Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator
npx tsc --noEmit
```

Expected: no errors. Then, with a real `OPENROUTER_API_KEY` configured in `.env` (already present in this repo per earlier verification this session):

```bash
cat > /tmp/verify-classify.mjs << 'EOF'
import { classifyLineLanguages } from "./src/lib/ai/openrouter.ts";
const tags = await classifyLineLanguages(["Ah", "amém", "oh yeah"]);
console.log(tags);
EOF
cp /tmp/verify-classify.mjs ./verify-classify.mjs
npx tsx verify-classify.mjs
rm -f ./verify-classify.mjs /tmp/verify-classify.mjs
```

Expected: an array of exactly 3 `"pt"`/`"en"` values, no thrown error.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/schema.ts src/lib/ai/openrouter.ts
git commit -m "$(cat <<'EOF'
Add AI fallback for ambiguous pt/en line classification

Only called for lines the cheap heuristic in languageDetect.ts couldn't
confidently tag — reuses the existing small/cheap-model pattern already
used for identifyLanguageOnly(), not the heavier translation prompts.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QshjjPA6vQbKNFeXecjbbP
EOF
)"
```

---

## Task 4: .pro decode pipeline

**Files:**
- Create: `src/lib/propresenter/decode.ts`

**Interfaces:**
- Consumes: `rtfToPlainText(rtf: string): string` (Task 1), `getPresentationType(): Promise<protobuf.Type>` (existing, `src/lib/propresenter/schema.ts`, unchanged).
- Produces: `decodeProFile(buffer: Buffer): Promise<{ title: string; cueLines: string[][] }>` — used by Task 5 (importSong.ts).

**Context:** Mirrors `encode.ts` in the same folder, but backwards: decode instead of encode, using the exact same `getPresentationType()` (already loads the vendored `vendor/propresenter7-proto` schema). `cueLines[i]` is cue `i`'s text lines, in document order, across all its text elements — this is the shape Task 2's `classifyCueLines`/`buildRawTextFromTags` and Task 5 expect.

- [ ] **Step 1: Write the decoder**

```typescript
// src/lib/propresenter/decode.ts
import { getPresentationType } from "./schema";
import { rtfToPlainText } from "./rtfText";

export interface DecodedProFile {
  title: string;
  /** One entry per cue, in document order; each entry is that cue's text
   * lines (already RTF-extracted), across all of that cue's text elements
   * concatenated in element order — matches what one ProPresenter cue shows
   * on one slide. Cues with no text elements at all are omitted. */
  cueLines: string[][];
}

/**
 * The slice of `rv.data.Presentation`'s decoded shape this module actually
 * reads. protobufjs doesn't generate TypeScript types for this vendored
 * schema (the existing encode side — see build.ts — builds plain objects the
 * same way, no generated types either), so this interface exists purely to
 * avoid `any` here, matching how src/lib/lyrics/musixmatch.ts's envelope
 * types handle other loosely-structured external data in this codebase.
 * Every field is optional: protobufjs's toObject() omits anything left at
 * its zero/default value, and a real .pro's exact shape can vary (confirmed
 * by decoding two different real files during this feature's spike).
 */
interface DecodedPresentation {
  name?: string;
  cues?: {
    actions?: {
      slide?: {
        presentation?: {
          baseSlide?: {
            elements?: {
              element?: {
                text?: {
                  rtfData?: Buffer;
                };
              };
            }[];
          };
        };
      };
    }[];
  }[];
}

export async function decodeProFile(buffer: Buffer): Promise<DecodedProFile> {
  const Presentation = await getPresentationType();
  const message = Presentation.decode(buffer);
  const obj = Presentation.toObject(message, { longs: String, bytes: Buffer }) as DecodedPresentation;

  const cueLines: string[][] = [];
  for (const cue of obj.cues ?? []) {
    const elements = cue.actions?.[0]?.slide?.presentation?.baseSlide?.elements ?? [];
    const lines: string[] = [];
    for (const el of elements) {
      const rtfBuffer = el.element?.text?.rtfData;
      if (!rtfBuffer) continue;
      const text = rtfToPlainText(rtfBuffer.toString("utf-8"));
      if (text) lines.push(...text.split("\n").filter((line) => line.length > 0));
    }
    if (lines.length > 0) cueLines.push(lines);
  }

  const title = obj.name?.trim() ? obj.name.trim() : "Música importada";

  return { title, cueLines };
}
```

- [ ] **Step 2: Verify against the real fixture files**

```bash
cd /Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator
cat > /tmp/verify-decode.mjs << 'EOF'
import { decodeProFile } from "./src/lib/propresenter/decode.ts";
import fs from "node:fs";

for (const file of ["/Users/guilhermetoti/Desktop/Abba.pro", "/Users/guilhermetoti/Desktop/Jesus We Love You.pro"]) {
  const buf = fs.readFileSync(file);
  const { title, cueLines } = await decodeProFile(buf);
  console.log(`\n=== ${file} ===`);
  console.log("title:", title);
  console.log("cue count:", cueLines.length);
  console.log("first 5 cues:", JSON.stringify(cueLines.slice(0, 5)));
}
EOF
cp /tmp/verify-decode.mjs ./verify-decode.mjs
npx tsx verify-decode.mjs
rm -f ./verify-decode.mjs /tmp/verify-decode.mjs
```

Expected: `title: "Abba"` / `title: "Jesus We Love You"` (matching the real decoded `obj.name` — confirmed during the spike), clean line arrays with no RTF artifacts, and for Jesus We Love You.pro specifically, cues whose entry is a 2-element array like `["Nosso afeto", "Our affection"]`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/propresenter/decode.ts
git commit -m "$(cat <<'EOF'
Add .pro decode pipeline for import

Mirrors encode.ts backwards — same getPresentationType() schema, decode is
symmetric to the existing Presentation.encode() call. Extracts per-cue text
via the new RTF extractor; verified against two real .pro files.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QshjjPA6vQbKNFeXecjbbP
EOF
)"
```

---

## Task 5: Import orchestrator

**Files:**
- Create: `src/lib/propresenter/importSong.ts`

**Interfaces:**
- Consumes: `decodeProFile()` (Task 4), `classifyCueLines()` + `buildRawTextFromTags()` + `LineLanguage` (Task 2), `classifyLineLanguages()` (Task 3), `buildAlignmentFromManual(rawA: string, rawB: string): AlignedLine[]` (existing, `src/lib/alignment.ts`, unchanged).
- Produces: `importSongFromProFile(buffer: Buffer): Promise<{ title: string; languageA: string; languageB: string; alignment: AlignedLine[] }>` — used by Task 7 (`/api/songs/import` route).

**Context:** Ties Tasks 1–4 together end to end: decode → classify → resolve ambiguous lines via AI (only if the song is bilingual and something is actually ambiguous) → build raw text → hand off to the **existing** `buildAlignmentFromManual()` for alignment, exactly like manually-pasted lyrics already work. On AI failure, ambiguous lines default to the song's dominant language rather than blocking the import — per the agreed error-handling behavior.

- [ ] **Step 1: Write the orchestrator**

```typescript
// src/lib/propresenter/importSong.ts
import { buildAlignmentFromManual } from "@/lib/alignment";
import type { AlignedLine } from "@/lib/types";
import { classifyLineLanguages } from "@/lib/ai/openrouter";
import { decodeProFile } from "./decode";
import { buildRawTextFromTags, classifyCueLines } from "./languageDetect";

export interface ImportedSong {
  title: string;
  languageA: string;
  languageB: string;
  alignment: AlignedLine[];
}

/** Decodes a .pro file buffer and turns it into ready-to-edit song data —
 * same shape generateSongWithAi() produces, so the caller (see
 * /api/songs/import) can feed it straight into createEmptySong(). */
export async function importSongFromProFile(buffer: Buffer): Promise<ImportedSong> {
  const { title, cueLines } = await decodeProFile(buffer);
  const { isBilingual, dominantLanguage, lineTags } = classifyCueLines(cueLines);

  const resolvedTags: ("pt" | "en")[][] = lineTags.map((tags) =>
    tags.map((tag) => (tag === "ambiguous" ? dominantLanguage : tag)),
  );

  if (isBilingual) {
    const ambiguous: { cueIndex: number; lineIndex: number; text: string }[] = [];
    lineTags.forEach((tags, cueIndex) => {
      tags.forEach((tag, lineIndex) => {
        if (tag === "ambiguous") ambiguous.push({ cueIndex, lineIndex, text: cueLines[cueIndex][lineIndex] });
      });
    });

    if (ambiguous.length > 0) {
      try {
        const resolved = await classifyLineLanguages(ambiguous.map((a) => a.text));
        ambiguous.forEach((a, i) => {
          resolvedTags[a.cueIndex][a.lineIndex] = resolved[i];
        });
      } catch (err) {
        // Already defaulted to dominantLanguage above — degrade gracefully,
        // never block the whole import over this.
        console.error("import: ambiguous line classification failed, using dominant language", err);
      }
    }
  }

  const { languageA, languageB } = buildRawTextFromTags(cueLines, resolvedTags, isBilingual, dominantLanguage);
  const alignment = buildAlignmentFromManual(languageA, languageB);

  return { title, languageA, languageB, alignment };
}
```

- [ ] **Step 2: Verify against the real fixture files**

```bash
cd /Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator
cat > /tmp/verify-import.mjs << 'EOF'
import { importSongFromProFile } from "./src/lib/propresenter/importSong.ts";
import fs from "node:fs";

for (const file of ["/Users/guilhermetoti/Desktop/Abba.pro", "/Users/guilhermetoti/Desktop/Jesus We Love You.pro"]) {
  const buf = fs.readFileSync(file);
  const result = await importSongFromProFile(buf);
  console.log(`\n=== ${file} ===`);
  console.log("title:", result.title);
  console.log("languageA (first 200 chars):", result.languageA.slice(0, 200));
  console.log("languageB (first 200 chars):", result.languageB.slice(0, 200));
  console.log("alignment rows:", result.alignment.length);
  console.log("first 3 rows:", JSON.stringify(result.alignment.slice(0, 3), null, 2));
}
EOF
cp /tmp/verify-import.mjs ./verify-import.mjs
npx tsx verify-import.mjs
rm -f ./verify-import.mjs /tmp/verify-import.mjs
```

Expected:
- Abba.pro: `languageA` has real Portuguese content, `languageB` is empty (single-language song → nothing in the English column — this is fine, it's exactly the "blank side" case `useAutoLiteralTranslation` (already built, earlier in this session) picks up automatically the moment the user lands on the editor).
- Jesus We Love You.pro: **both** `languageA` and `languageB` have real content (`languageA` starting with something like `"Nosso afeto"`, `languageB` with `"Our affection"`), and `alignment` rows pair them correctly (row 0's `a` should be Portuguese, `b` should be the matching English line).

If Jesus We Love You.pro comes back with `languageB` empty (i.e. `isBilingual` came back `false`), stop and re-check Task 2's threshold/heuristic before continuing — that would mean the layered detection isn't working as designed.

- [ ] **Step 3: Commit**

```bash
git add src/lib/propresenter/importSong.ts
git commit -m "$(cat <<'EOF'
Add import orchestrator tying decode + language detection together

Hands off to the existing buildAlignmentFromManual() for alignment —
imported lyrics are treated exactly like manually-pasted ones once split
into languageA/languageB, no new alignment-building code needed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QshjjPA6vQbKNFeXecjbbP
EOF
)"
```

---

## Task 6: `/api/songs/import-list` route

**Files:**
- Create: `src/app/api/songs/import-list/route.ts`

**Interfaces:**
- Consumes: `isDesktopServer()` (existing, `src/lib/desktop/envFile.ts`).
- Produces: HTTP `POST /api/songs/import-list`, body `{ libraryFolder: string }`, response `{ files: { library: string; filename: string; path: string }[] }` on success or `{ error: string }` — used by Task 8 (`useImportSong.ts`).

**Context:** Fast, no protobuf decoding — just directory listing. Confirmed real folder shape (from the user): `libraryFolder` points at one specific library folder nested directly under a `Libraries` parent that also holds sibling library folders, `.pro` files sit flat (no subfolders) inside each library folder. Falls back to just the selected library if the parent-traversal assumption doesn't hold (permissions, unexpected structure) rather than erroring out entirely, per the agreed error-handling behavior.

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/songs/import-list/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { isDesktopServer } from "@/lib/desktop/envFile";

const requestSchema = z.object({
  libraryFolder: z.string().min(1),
});

export interface ImportableFile {
  library: string;
  filename: string;
  path: string;
}

async function listProFiles(folder: string, libraryLabel: string): Promise<ImportableFile[]> {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pro"))
    .map((entry) => ({ library: libraryLabel, filename: entry.name, path: path.join(folder, entry.name) }));
}

export async function POST(request: Request) {
  if (!isDesktopServer()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const { libraryFolder } = parsed.data;
  const librariesParent = path.dirname(libraryFolder);

  try {
    const siblingEntries = await fs.readdir(librariesParent, { withFileTypes: true });
    const libraryDirs = siblingEntries.filter((entry) => entry.isDirectory());

    const files: ImportableFile[] = [];
    for (const dir of libraryDirs) {
      const libraryPath = path.join(librariesParent, dir.name);
      try {
        files.push(...(await listProFiles(libraryPath, dir.name)));
      } catch {
        // One sibling library folder unreadable (permissions, etc.) shouldn't sink the whole listing.
      }
    }
    files.sort((a, b) => a.filename.localeCompare(b.filename, "pt-BR"));
    return NextResponse.json({ files });
  } catch (err) {
    console.error("import-list: parent traversal failed, falling back to the selected library only", err);
    try {
      const files = (await listProFiles(libraryFolder, path.basename(libraryFolder))).sort((a, b) =>
        a.filename.localeCompare(b.filename, "pt-BR"),
      );
      return NextResponse.json({ files });
    } catch (fallbackErr) {
      console.error("import-list: fallback to selected library also failed", fallbackErr);
      return NextResponse.json({ error: "Não foi possível ler a pasta da Library." }, { status: 500 });
    }
  }
}
```

- [ ] **Step 2: Verify with a real request**

```bash
cd /Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator
lsof -ti:3000 2>/dev/null | xargs -r kill 2>/dev/null
sleep 1
PMA_DESKTOP_APP=1 npx next dev -p 3911 > /tmp/import-list-test.log 2>&1 &
disown
sleep 5
```

Replace `/path/to/a/real/library/folder` below with an actual folder on this machine that has at least one `.pro` file in it (any folder works for this check — it doesn't have to match the real ProPresenter Libraries structure, since the fallback path is exactly what's being exercised when the parent isn't a real Libraries folder):

```bash
curl -s -X POST http://localhost:3911/api/songs/import-list \
  -H "Content-Type: application/json" \
  -d '{"libraryFolder": "/Users/guilhermetoti/Desktop"}' | python3 -m json.tool
lsof -ti:3911 2>/dev/null | xargs -r kill 2>/dev/null
rm -f /tmp/import-list-test.log
```

Expected: `{"files": [...]}` listing `.pro` files found (with `PMA_DESKTOP_APP=1` set, `/Users/guilhermetoti/Desktop`'s parent is `/Users/guilhermetoti`, which won't have sibling "Desktop-like" folders full of `.pro` files, so this specifically exercises — and should hit — the fallback branch; confirm the two real fixture files `Abba.pro` and `Jesus We Love You.pro` show up in the result since they're on the Desktop). Without `PMA_DESKTOP_APP=1` (or hitting port 3000 directly without it set), confirm the route 404s.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/songs/import-list/route.ts
git commit -m "$(cat <<'EOF'
Add /api/songs/import-list route

Lists .pro files across all sibling library folders (not just the selected
one), matching the real ProPresenter folder structure the user confirmed —
falls back to just the selected library if that structure isn't there.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QshjjPA6vQbKNFeXecjbbP
EOF
)"
```

---

## Task 7: `/api/songs/import` route

**Files:**
- Create: `src/app/api/songs/import/route.ts`

**Interfaces:**
- Consumes: `isDesktopServer()` (existing), `importSongFromProFile()` (Task 5), `createEmptySong()` (existing, `src/lib/types.ts`).
- Produces: HTTP `POST /api/songs/import`, body `{ path: string }`, response `{ song: Song }` on success or `{ error: string }` — used by Task 8 (`useImportSong.ts`). Response shape matches `/api/generate-song`'s exactly (`{ song: Song }`), so the client can call `startSong(data.song)` the same way `useGenerateSong.ts` already does.

**Context:** `mode: "manual"` is used for imported songs (not `"ai"` — there's no Musixmatch source or `translatableSide` to track, and `"manual"`'s existing fallback behavior in `canOfferAiTranslation` (src/components/studio/LyricsEditors.tsx) — "eligible if this side has no source of its own" — already does something reasonable for imports, since neither side has a `SideSource`).

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/songs/import/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import fs from "node:fs/promises";
import { isDesktopServer } from "@/lib/desktop/envFile";
import { importSongFromProFile } from "@/lib/propresenter/importSong";
import { createEmptySong } from "@/lib/types";

const requestSchema = z.object({
  path: z.string().min(1),
});

export async function POST(request: Request) {
  if (!isDesktopServer()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  try {
    const buffer = await fs.readFile(parsed.data.path);
    const imported = await importSongFromProFile(buffer);
    const song = createEmptySong({
      title: imported.title,
      mode: "manual",
      languageA: imported.languageA,
      languageB: imported.languageB,
      alignment: imported.alignment,
    });
    return NextResponse.json({ song });
  } catch (error) {
    console.error("song import failed", error);
    return NextResponse.json(
      { error: "Não foi possível importar esse arquivo. Ele pode estar corrompido ou em um formato inesperado." },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify with a real request against both fixture files**

```bash
cd /Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator
lsof -ti:3000 2>/dev/null | xargs -r kill 2>/dev/null
sleep 1
PMA_DESKTOP_APP=1 npx next dev -p 3911 > /tmp/import-test.log 2>&1 &
disown
sleep 5

curl -s -X POST http://localhost:3911/api/songs/import \
  -H "Content-Type: application/json" \
  -d '{"path": "/Users/guilhermetoti/Desktop/Abba.pro"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
song = d.get('song', d)
print('title:', song.get('title'))
print('mode:', song.get('mode'))
print('languageA non-empty:', bool(song.get('languageA','').strip()))
print('languageB non-empty:', bool(song.get('languageB','').strip()))
print('alignment rows:', len(song.get('alignment', [])))
"

curl -s -X POST http://localhost:3911/api/songs/import \
  -H "Content-Type: application/json" \
  -d '{"path": "/Users/guilhermetoti/Desktop/Jesus We Love You.pro"}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
song = d.get('song', d)
print('title:', song.get('title'))
print('languageA non-empty:', bool(song.get('languageA','').strip()))
print('languageB non-empty:', bool(song.get('languageB','').strip()))
print('alignment rows:', len(song.get('alignment', [])))
print('first row:', song.get('alignment', [{}])[0])
"

lsof -ti:3911 2>/dev/null | xargs -r kill 2>/dev/null
rm -f /tmp/import-test.log
```

Expected: Abba — `title: "Abba"`, `languageA` non-empty, `languageB` empty (single-language). Jesus We Love You — `title: "Jesus We Love You"`, **both** languages non-empty, first alignment row's `a` is a Portuguese line and `b` is its English pair.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/songs/import/route.ts
git commit -m "$(cat <<'EOF'
Add /api/songs/import route

Reads a chosen .pro file, decodes/classifies it, and returns a Song shaped
identically to /api/generate-song's response so the client reuses the same
startSong() landing flow.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QshjjPA6vQbKNFeXecjbbP
EOF
)"
```

---

## Task 8: Client hook

**Files:**
- Create: `src/lib/useImportSong.ts`

**Interfaces:**
- Consumes: `/api/songs/import-list`, `/api/songs/import` (Tasks 6–7), `Song` type (existing, `src/lib/types.ts`).
- Produces: `useImportSong()` returning `{ list(libraryFolder: string): Promise<{files: ImportableFile[]} | {error: string}>, importFile(path: string): Promise<{ok: true; song: Song} | {error: string}> }`, and the `ImportableFile` type — used by Task 9 (`ImportSongDialog.tsx`).

**Context:** Mirrors `src/lib/useGenerateSong.ts`'s shape exactly (a `search`/`generate` pair there, a `list`/`importFile` pair here) — same error-handling convention (`{error: string}` on failure, never throws).

- [ ] **Step 1: Write the hook**

```typescript
// src/lib/useImportSong.ts
"use client";

import type { Song } from "@/lib/types";

export interface ImportableFile {
  library: string;
  filename: string;
  path: string;
}

/** Mirrors useGenerateSong.ts's shape — list()/importFile() instead of search()/generate(),
 * same {error} convention on failure. */
export function useImportSong() {
  const list = async (libraryFolder: string): Promise<{ files: ImportableFile[] } | { error: string }> => {
    try {
      const res = await fetch("/api/songs/import-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libraryFolder }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Algo deu errado.");
      return { files: (data.files ?? []) as ImportableFile[] };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Algo deu errado." };
    }
  };

  const importFile = async (path: string): Promise<{ ok: true; song: Song } | { error: string }> => {
    try {
      const res = await fetch("/api/songs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Algo deu errado.");
      return { ok: true, song: data.song as Song };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Algo deu errado." };
    }
  };

  return { list, importFile };
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/useImportSong.ts
git commit -m "$(cat <<'EOF'
Add useImportSong client hook

Mirrors useGenerateSong.ts's shape (list/importFile instead of
search/generate) — same error-handling convention.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QshjjPA6vQbKNFeXecjbbP
EOF
)"
```

---

## Task 9: `ImportSongDialog` component

**Files:**
- Create: `src/components/studio/ImportSongDialog.tsx`

**Interfaces:**
- Consumes: `useImportSong()` (Task 8), `Modal`/`Input`/`Label` (existing, `src/components/ui/`), `useDesktopStore` (existing, for `libraryFolder`), `useLibraryStore().startSong` (existing).
- Produces: `<ImportSongDialog open={boolean} onClose={() => void} />` — used by Task 10 (Header/AppShell wiring).

**Context:** Reuses `Modal` exactly like `NewSongDialog.tsx` does, and the search-input + clickable-list-item pattern from `CatalogSearch.tsx` (not that component itself, since the data source and columns shown are different — same visual/interaction pattern, new component). Filtering is client-side over the already-fetched file list (the list itself doesn't refetch per keystroke).

- [ ] **Step 1: Write the component**

```typescript jsx
// src/components/studio/ImportSongDialog.tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input, Label } from "@/components/ui/Field";
import { useDesktopStore } from "@/lib/desktopStore";
import { useLibraryStore } from "@/lib/store";
import { useImportSong, type ImportableFile } from "@/lib/useImportSong";

interface ImportSongDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ImportSongDialog({ open, onClose }: ImportSongDialogProps) {
  const libraryFolder = useDesktopStore((s) => s.libraryFolder);
  const startSong = useLibraryStore((s) => s.startSong);
  const { list, importFile } = useImportSong();

  const [files, setFiles] = useState<ImportableFile[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [importingPath, setImportingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !libraryFolder) return;
    setLoading(true);
    setError(null);
    setQuery("");
    void list(libraryFolder).then((result) => {
      setLoading(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setFiles(result.files);
    });
  }, [open, libraryFolder]);

  const filtered = files.filter((file) => file.filename.toLowerCase().includes(query.trim().toLowerCase()));

  const handlePick = async (file: ImportableFile) => {
    setImportingPath(file.path);
    setError(null);
    const result = await importFile(file.path);
    setImportingPath(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    startSong(result.song);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Importar do ProPresenter">
      <div className="space-y-4">
        {!libraryFolder ? (
          <p className="text-sm text-ink/55">Configure a Pasta da Library em Ajustes antes de importar.</p>
        ) : (
          <>
            <div>
              <Label htmlFor="import-query">Filtrar por nome do arquivo</Label>
              <Input
                id="import-query"
                autoFocus
                placeholder="ex.: Oceans"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {loading && (
              <p className="flex items-center gap-2 text-sm text-ink/55">
                <Loader2 size={14} className="animate-spin" />
                Procurando arquivos…
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!loading && files.length === 0 && !error && <p className="text-sm text-ink/55">Nenhum arquivo .pro encontrado.</p>}
            {!loading && files.length > 0 && filtered.length === 0 && (
              <p className="text-sm text-ink/55">Nada encontrado com esse filtro.</p>
            )}

            {filtered.length > 0 && (
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {filtered.map((file) => (
                  <li key={file.path}>
                    <button
                      onClick={() => void handlePick(file)}
                      disabled={importingPath !== null}
                      className="flex w-full items-baseline justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent/5 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{file.filename}</span>
                        <span className="block truncate text-xs text-ink/55">{file.library}</span>
                      </span>
                      {importingPath === file.path && <Loader2 size={14} className="shrink-0 animate-spin" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Type-check and lint**

```bash
cd /Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator
npx tsc --noEmit
npx eslint src/components/studio/ImportSongDialog.tsx
```

Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/studio/ImportSongDialog.tsx
git commit -m "$(cat <<'EOF'
Add ImportSongDialog component

Same Modal + search/list interaction pattern as NewSongDialog/CatalogSearch,
listing .pro files instead of Musixmatch results.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QshjjPA6vQbKNFeXecjbbP
EOF
)"
```

---

## Task 10: Header/AppShell wiring — "Importar" button

**Files:**
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `ImportSongDialog` (Task 9).
- Produces: nothing further consumed by later tasks — this is the last wiring point.

**Context:** Desktop-only per the user's explicit requirement — mirrors how `showSettings`/`onOpenSettings` are already conditionally passed only when `desktop` is true in `AppShell.tsx`. Placed next to the Home button already in `Header.tsx` (added earlier this session).

- [ ] **Step 1: Add the button to Header**

In `src/components/layout/Header.tsx`, add `onImport` as an optional prop and render a button for it only when provided (same pattern `showSettings`/`onOpenSettings` already use):

```typescript
// Add to the icon imports at the top:
import { Download, Home, Plus, Settings } from "lucide-react";
```

```typescript
// Extend HeaderProps:
interface HeaderProps {
  onNewSong: () => void;
  onGoHome: () => void;
  showTitle?: boolean;
  showSettings?: boolean;
  onOpenSettings?: () => void;
  /** Desktop-only — see AppShell.tsx, which only passes this when isDesktopApp(). */
  onImport?: () => void;
}
```

```typescript
// Extend the function signature:
export function Header({ onNewSong, onGoHome, showTitle = true, showSettings, onOpenSettings, onImport }: HeaderProps) {
```

Add the button in the JSX, right before the existing settings button (inside the `<header>`, after the `<div className="flex-1" />` spacer):

```typescript jsx
{onImport && (
  <button
    onClick={onImport}
    className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
  >
    <Download size={14} />
    Importar
  </button>
)}
```

- [ ] **Step 2: Wire it up in AppShell**

In `src/components/layout/AppShell.tsx`, add the dialog's open state and pass `onImport` only in desktop mode, following the exact pattern `settingsOpen`/`SettingsDialog` already use:

```typescript
// Add to imports:
import { ImportSongDialog } from "@/components/studio/ImportSongDialog";
```

```typescript
// Add alongside the existing settingsOpen state:
const [importOpen, setImportOpen] = useState(false);
```

In the main (mounted) `<Header>` render — the one that already has `showSettings`/`onOpenSettings` — add:

```typescript jsx
<Header
  onNewSong={openNewSongDialog}
  onGoHome={goHome}
  showTitle={!desktop}
  showSettings={desktop}
  onOpenSettings={() => setSettingsOpen(true)}
  onImport={desktop ? () => setImportOpen(true) : undefined}
/>
```

And render the dialog alongside the other desktop-only modals (next to `{desktop && <SettingsDialog .../>}`):

```typescript jsx
{desktop && <ImportSongDialog open={importOpen} onClose={() => setImportOpen(false)} />}
```

- [ ] **Step 3: Type-check and lint**

```bash
cd /Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator
npx tsc --noEmit
npx eslint src/components/layout/Header.tsx src/components/layout/AppShell.tsx
```

Expected: both clean.

- [ ] **Step 4: Verify the button only appears in desktop mode**

```bash
cd /Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator
lsof -ti:3000 2>/dev/null | xargs -r kill 2>/dev/null
sleep 1
npm run dev > /tmp/import-ui-test.log 2>&1 &
disown
sleep 5
echo "--- web mode (no PMA_DESKTOP_APP) ---"
curl -s http://localhost:3000/_next/static/chunks/src_*.js 2>/dev/null | grep -o "Importar" | head -1 || echo "not found in bundle text is fine — check happens at runtime via isDesktopApp(), confirm by inspecting rendered HTML/behavior instead"
lsof -ti:3000 2>/dev/null | xargs -r kill 2>/dev/null
rm -f /tmp/import-ui-test.log
```

The string "Importar" will be present in the compiled bundle regardless of mode (it's still code, just conditionally rendered) — the real check is that `onImport` stays `undefined` in web mode. Confirm by reading the AppShell.tsx diff: `onImport={desktop ? () => setImportOpen(true) : undefined}` — `desktop` comes from `isDesktopApp()`, an existing, already-tested check used identically for `showSettings`. This is sufficient verification given the existing precedent; a full click-through happens in Task 11.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Header.tsx src/components/layout/AppShell.tsx
git commit -m "$(cat <<'EOF'
Add desktop-only "Importar" button to Header

Opens ImportSongDialog — same conditional-rendering pattern already used
for the Settings button (only passed when isDesktopApp() is true).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QshjjPA6vQbKNFeXecjbbP
EOF
)"
```

---

## Task 11: End-to-end manual verification

**Files:** none (verification only).

**Interfaces:** Consumes the entire feature (Tasks 1–10).

**Context:** Per this repo's own established practice this session — every non-trivial change gets verified against a real run, not just type-checking. This task runs the actual desktop dev flow and clicks through both fixture files.

- [ ] **Step 1: Run the real desktop dev flow**

```bash
cd /Users/guilhermetoti/Projects/poiema/propresenter-lyrics-generator
npm run tauri:dev
```

- [ ] **Step 2: Configure the Library folder**

In the running app, open Ajustes and set "Pasta da Library" to `/Users/guilhermetoti/Desktop` (this makes the fixture files directly visible without needing a real ProPresenter installation — the import-list route's fallback path, verified in Task 6, handles this folder shape correctly).

- [ ] **Step 3: Import the single-language fixture**

Click "Importar" in the header, confirm `Abba.pro` appears in the list, click it. Confirm:
- You land on the normal editor (not an error).
- Title reads "Abba".
- The Português side has real lyrics.
- The Inglês side is either already filled in (if `useAutoLiteralTranslation` — built earlier this session — auto-translated it) or shows the "Traduzindo…" loading state.

- [ ] **Step 4: Import the bilingual fixture**

Click Home, then "Importar" again, click `Jesus We Love You.pro`. Confirm:
- Title reads "Jesus We Love You".
- **Both** Português and Inglês sides have real, correctly-paired lyrics (Português: "Nosso afeto" / Inglês: "Our affection", etc.) — not one side blank, not garbled text.

- [ ] **Step 5: Confirm the filter works**

Reopen the import dialog, type part of a filename into the filter field, confirm the list narrows correctly.

- [ ] **Step 6: No commit for this task** — it's verification only, nothing to commit. If any step fails, fix the relevant earlier task's code, re-run that task's own verification, then re-run this task from Step 1.

---

## Self-Review

**Spec coverage:** every element of the design worked out in conversation is covered — desktop-only "Importar" button (Task 10), modal reusing existing UI patterns with filename-only listing + client-side filter (Tasks 6, 9), cross-library folder scanning going up one level from the configured `libraryFolder` (Task 6), decode via the existing vendored protobuf schema (Task 4), the layered heuristic-then-AI language classification the user explicitly approved (Tasks 2–3, orchestrated in Task 5), landing on the normal editor via the existing `startSong()` (Tasks 7–9), and manual end-to-end verification against both real fixture files used throughout the spike (Task 11).

**Placeholder scan:** no TBD/TODO markers; every code step is complete, runnable code; every test step is a real command with a stated expected result.

**Type consistency:** `ImportableFile` (`{library, filename, path}`) is independently defined twice — once in Task 6's route file (server-only, never imported client-side, matching this repo's Next.js App Router convention of not importing `route.ts` internals into "use client" code) and again in Task 8's hook, which is what Task 9 actually imports from. This is a deliberate small duplication, not a bug — both declarations use the same three field names, so they stay structurally interchangeable even though neither imports the other. `LineLanguage` (Task 2) is `"pt" | "en" | "ambiguous"`; `importSong.ts` (Task 5) narrows it to `("pt" | "en")[][]` before calling `buildRawTextFromTags`, matching that function's declared parameter type. `ImportedSong`'s fields (`title`, `languageA`, `languageB`, `alignment`) match exactly what Task 7's route destructures. The response shape `{ song: Song }` is identical between `/api/generate-song` (existing) and `/api/songs/import` (Task 7), so `useImportSong.importFile`'s return type and `ImportSongDialog`'s `startSong(result.song)` call line up with no casting beyond the same `as Song` pattern `useGenerateSong.ts` already uses.
