# PMA Lyrics Studio

Turn a song into a bilingual (Português/English), line-by-line lyric alignment and export it straight to a ProPresenter 7 `.pro` file — no PDF, no manual re-typing in ProPresenter. Built for a church that only ever presents in these two languages: Editor A is always Português, Editor B is always English.

## How it works

Every project goes through the same pipeline — **align → preview → export** — but there are two ways to get to the alignment:

- **Generate with AI** (default, recommended) — type a song title, a lyric snippet, or a short description. This is sent to an LLM via [OpenRouter](https://openrouter.ai), which identifies the song, recalls its lyrics, and produces (or finds) a Português/English translation pair, already split into sections and aligned line-by-line (Editor A always ends up Português, regardless of which language the song was actually written in). You land straight on the alignment preview to review before exporting.
- **Create manually** — paste one language into Editor A and the other into Editor B (blank line = new section), then click "Alinhar letra" to pair them line-by-line and section-by-section, editable afterwards. Once aligned, "Realinhar com IA" can send both texts back through the LLM to fix missing lines, duplicates, or misalignment.

From there, both flows share the same alignment editor (reorder, split, merge, or retitle any section) and the same **Export → .pro** step, which builds a real ProPresenter 7 presentation: one slide per group of N lines, grouped into ProPresenter slide groups per section, with the song's CCLI/title/artist/key metadata attached.

## Tech stack

- **Next.js 16** (App Router, Turbopack, React 19)
- **TypeScript**, **Zod** for schema validation at every trust boundary (AI responses, export payloads)
- **Tailwind CSS 4**
- **Zustand** (+ `persist`) for the local project library — everything lives in the browser's `localStorage`; there is no backend database
- **protobufjs**, decoding/encoding against a vendored, reverse-engineered ProPresenter 7 `.proto` schema (`vendor/propresenter7-proto`, MIT licensed — see that folder's `README.md`)

## Getting started

```bash
npm install
cp .env.example .env.local   # add your OpenRouter key to use "Generate with AI"
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The manual flow works with no configuration; the AI flow needs `OPENROUTER_API_KEY` set (see `.env.example`) and otherwise fails gracefully with a message explaining how to configure it.

## Project structure

```
src/app/                     Routes: the studio page + API routes (generate-song, export/propresenter)
src/components/studio/       New-project dialog, lyric editors, alignment preview, export panel
src/components/library/      Sidebar listing saved projects (Zustand-persisted)
src/lib/alignment.ts         Pure functions: splitting lyrics into sections, pairing lines, slide grouping
src/lib/ai/                  OpenRouter prompt/schema/response → Song mapping
src/lib/propresenter/        .pro document builder, RTF text encoder, protobuf schema loader/encoder
vendor/propresenter7-proto/  Vendored ProPresenter 7 .proto schema (unofficial, reverse-engineered)
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` / `npm run start` — production build and serve
- `npm run lint` — ESLint
