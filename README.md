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
- **Tauri 2** (Rust) wraps the same app as a native Windows/macOS/Linux desktop installer — see [Desktop app](#desktop-app-windowsmacos) below

## Getting started (web)

```bash
npm install
cp .env.example .env.local   # add your OpenRouter key to use "Generate with AI"
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The manual flow works with no configuration; the AI flow needs `OPENROUTER_API_KEY` set (see `.env.example`) and otherwise fails gracefully with a message explaining how to configure it.

## Desktop app (Windows/macOS)

The exact same app also ships as a native installable desktop app via [Tauri](https://tauri.app): a small Rust shell opens the OS's native webview (WebView2 on Windows, WebKit on macOS) and points it at a bundled copy of this same Next.js app, run as a background sidecar process — no separate backend, no Chromium bundled, no code fork. Today this is scope-for-scope identical to the web app (same studio, same AI generation, same `.pro` export via download); it's the foundation for later native-only features (e.g. writing the `.pro` straight into a detected ProPresenter playlist folder).

### Prerequisites

- Node.js 20+ and npm (already needed for the web app)
- [Rust](https://www.rust-lang.org/tools/install) via `rustup` (stable toolchain)
- Platform build tools, per [Tauri's prerequisites guide](https://tauri.app/start/prerequisites/):
  - **Windows**: "Desktop development with C++" workload from the Visual Studio Build Tools, and the WebView2 runtime (preinstalled on Windows 11 and most updated Windows 10 machines)
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)

Builds are **not cross-compiled** — build on Windows to get the `.exe`/installer, and on macOS to get the `.app`/`.dmg`. (The same commands also work on Linux, producing a `.deb`/`.rpm`/AppImage.)

### Run in development

```bash
npm install
npm run tauri:dev
```

This starts `next dev` (hot reload included) and opens it in a native window. The AI flow still needs `OPENROUTER_API_KEY` — same `.env.local` as the web app.

### Build an installer

```bash
npm run tauri:build
```

This runs `next build` with a standalone server output, bundles a copy of the local Node runtime as the app's sidecar (no system-wide Node install required on the end user's machine), and produces a platform-native installer under `src-tauri/target/release/bundle/`:

- **Windows**: `bundle/nsis/*.exe` and/or `bundle/msi/*.msi`
- **macOS**: `bundle/dmg/*.dmg` and `bundle/macos/*.app`

### Configuring `OPENROUTER_API_KEY` for the installed app

The packaged app has no `.env.local` — instead, create a plain `.env` file (same `KEY=value` format as `.env.example`) in the app's config directory:

- **Windows**: `%APPDATA%\com.pma.lyricsstudio\.env`
- **macOS**: `~/Library/Application Support/com.pma.lyricsstudio/.env`

Restart the app after adding or editing it. Without it, the app runs fine and the manual (non-AI) flow works exactly as in the browser.

## Project structure

```
src/app/                     Routes: the studio page + API routes (generate-song, export/propresenter)
src/components/studio/       New-project dialog, lyric editors, alignment preview, export panel
src/components/library/      Sidebar listing saved projects (Zustand-persisted)
src/lib/alignment.ts         Pure functions: splitting lyrics into sections, pairing lines, slide grouping
src/lib/ai/                  OpenRouter prompt/schema/response → Song mapping
src/lib/propresenter/        .pro document builder, RTF text encoder, protobuf schema loader/encoder
vendor/propresenter7-proto/  Vendored ProPresenter 7 .proto schema (unofficial, reverse-engineered)
src-tauri/                   Tauri (Rust) desktop shell — spawns the bundled server, opens the native window
scripts/tauri/prebuild.mjs   Assembles the standalone Next.js server + sidecar Node binary before a Tauri build
```

## Scripts

- `npm run dev` — start the web dev server
- `npm run build` / `npm run start` — production build and serve (web)
- `npm run lint` — ESLint
- `npm run tauri:dev` — run the desktop app in development
- `npm run tauri:build` — build the desktop installer for the current OS
