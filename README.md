# PMA Lyrics Studio

Turn a song into a bilingual (Português/English), line-by-line lyric alignment and export it straight to a ProPresenter 7 `.pro` file — no PDF, no manual re-typing in ProPresenter. Built for a church that only ever presents in these two languages: Editor A is always Português, Editor B is always English.

## How it works

Every song goes through the same pipeline — **align → preview → export** — but there are two ways to get to the alignment:

- **Generate with AI** (default, recommended) — type a song title, a lyric snippet, or a short description. This is sent to an LLM via [OpenRouter](https://openrouter.ai), which identifies the song, recalls its lyrics, and produces (or finds) a Português/English translation pair, already split into sections and aligned line-by-line (Editor A always ends up Português, regardless of which language the song was actually written in). You land straight on the alignment preview to review before exporting.
- **Create manually** — paste one language into Editor A and the other into Editor B (blank line = new section), then click "Alinhar letra" to pair them line-by-line and section-by-section, editable afterwards. Once aligned, "Realinhar com IA" can send both texts back through the LLM to fix missing lines, duplicates, or misalignment.

From there, both flows share the same alignment editor (reorder, split, merge, or retitle any section) and the same **Export → .pro** step, which builds a real ProPresenter 7 presentation: one slide per group of N lines, grouped into ProPresenter slide groups per section, with the song's CCLI/title/artist/key metadata attached.

## Tech stack

- **Next.js 16** (App Router, Turbopack, React 19)
- **TypeScript**, **Zod** for schema validation at every trust boundary (AI responses, export payloads)
- **Tailwind CSS 4**
- **Zustand** (+ `persist`) for the local song library — everything lives in the browser's `localStorage`; there is no backend database
- **protobufjs**, decoding/encoding against a vendored, reverse-engineered ProPresenter 7 `.proto` schema (`vendor/propresenter7-proto`, MIT licensed — see that folder's `README.md`)
- **Tauri 2** (Rust) wraps the same app as a native Windows/macOS/Linux desktop installer — see [Desktop app](#desktop-app-windowsmacos) below

## Getting started (web)

```bash
pnpm install
cp .env.example .env.local   # add your OpenRouter key to use "Generate with AI"
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The manual flow works with no configuration; the AI flow needs `OPENROUTER_API_KEY` set (see `.env.example`) and otherwise fails gracefully with a message explaining how to configure it.

## Desktop app (Windows/macOS)

The exact same app also ships as a native installable desktop app via [Tauri](https://tauri.app): a small Rust shell opens the OS's native webview (WebView2 on Windows, WebKit on macOS) and points it at a bundled copy of this same Next.js app, run as a background sidecar process — no separate backend, no Chromium bundled, no code fork. The web app's studio, AI generation, and `.pro` download all work identically; the desktop build additionally knows how to export straight into a ProPresenter Library folder (see below).

### Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io) (already needed for the web app) — this repo commits `pnpm-lock.yaml` as the single source of truth for dependency versions, so use `pnpm` rather than `npm`/`yarn` for installs to avoid a second, drifting lockfile
- [Rust](https://www.rust-lang.org/tools/install) via `rustup` (stable toolchain)
- Platform build tools, per [Tauri's prerequisites guide](https://tauri.app/start/prerequisites/):
  - **Windows**: "Desktop development with C++" workload from the Visual Studio Build Tools, and the WebView2 runtime (preinstalled on Windows 11 and most updated Windows 10 machines)
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)

Builds are **not cross-compiled** — build on Windows to get the `.exe`/installer, and on macOS to get the `.app`/`.dmg`. (The same commands also work on Linux, producing a `.deb`/`.rpm`/AppImage.)

### Run in development

```bash
pnpm install
pnpm tauri:dev
```

This starts `next dev` (hot reload included) and opens it in a native window. The AI flow still needs `OPENROUTER_API_KEY` — same `.env.local` as the web app.

### Build an installer

```bash
pnpm tauri:build
```

This runs `next build` with a standalone server output, bundles a copy of the local Node runtime as the app's sidecar (no system-wide Node install required on the end user's machine), and produces a platform-native installer under `src-tauri/target/release/bundle/`:

- **Windows**: `bundle/nsis/*.exe` and/or `bundle/msi/*.msi`
- **macOS**: `bundle/dmg/*.dmg` and `bundle/macos/*.app`

### Configuring `OPENROUTER_API_KEY` for the installed app

The packaged app has no `.env.local` — instead, create a plain `.env` file (same `KEY=value` format as `.env.example`) in the app's config directory:

- **Windows**: `%APPDATA%\com.pma.lyricsstudio\.env`
- **macOS**: `~/Library/Application Support/com.pma.lyricsstudio/.env`

Restart the app after adding or editing it. Without it, the app runs fine and the manual (non-AI) flow works exactly as in the browser.

### Exporting straight into ProPresenter, and auto-detecting the current playlist

Open **Ajustes** (the gear icon in the header — desktop app only) to configure:

- **Pasta da Library** — a ProPresenter Library folder. Once set, clicking "Exportar" writes the `.pro` file straight into it (no download dialog) instead of downloading it; the ProPresenter Library panel already reads that folder natively, so the presentation shows up there.
- **Pasta de Playlists** — your ProPresenter `Playlists` folder. The app polls it every ~20s for playlists it hasn't seen before (e.g. a new one you just created for this week's service) and asks "Nova playlist encontrada: '<nome>'. Usar ela como destino?" — accepting just sets a label shown alongside the export button, reminding you which playlist to drag the exported presentation into.

**Why the export doesn't write directly into the playlist itself:** in ProPresenter 7, a *Playlist* isn't a folder — it's a structured document (same protobuf family as `.pro` files, see `vendor/propresenter7-proto/proto/playlist.proto`) that references presentations elsewhere on disk. Editing that document from outside ProPresenter while it might be open and live-presenting risks corrupting it or losing the change to ProPresenter's own autosave. Writing into the Library instead is the same effect with none of that risk: the file appears where ProPresenter already expects new presentations, and dragging it into the current playlist is one click. If the playlist you had selected gets deleted or renamed before your next export, the app notices and asks you to pick another before it writes the file.

### Quick-add: a global hotkey for songs you didn't plan for

Press **`Ctrl+Alt+Shift+N`** (`⌃⌥⇧N` on macOS) from anywhere — the app doesn't need to be focused, or even visible — and a small popup appears with just a text field: type a title, lyric snippet, or description and hit Enter. That's for the moment the band starts a song that isn't in your library yet: no need to switch away from ProPresenter, bring the full app to the front, and click through "Nova música" first.

The popup only captures the query and kicks off "Generate with AI"; once the song's ready, the popup closes, the main window comes to the front, and the new song is open in the alignment editor exactly like the normal "Nova música" flow — same review step before exporting. Esc, or clicking away, dismisses the popup without doing anything.

## Project structure

```
src/app/                     Routes: the studio page, quick-add popup page, API routes (generate-song, export/propresenter)
src/components/studio/       New-song dialog, lyric editors, alignment preview, export panel
src/components/library/      Sidebar listing saved songs (Zustand-persisted)
src/lib/alignment.ts         Pure functions: splitting lyrics into sections, pairing lines, slide grouping
src/lib/ai/                  OpenRouter prompt/schema/response → Song mapping
src/lib/useGenerateSong.ts   Shared "Generate with AI" flow, used by both the in-app dialog and the quick-add popup
src/lib/propresenter/        .pro document builder/encoder, Playlist document scanner/decoder, protobuf schema loaders
src/lib/desktopStore.ts      Zustand store for desktop-only settings (Library/Playlists folders, active playlist)
src/lib/desktop/             usePlaylistWatcher (Playlists-folder polling), useQuickAddListener (cross-window handoff)
src/components/settings/     Ajustes dialog + the shared playlist picker modal
vendor/propresenter7-proto/  Vendored ProPresenter 7 .proto schema (unofficial, reverse-engineered)
src-tauri/                   Tauri (Rust) desktop shell — bundled server, native windows, global hotkey, folder-picker dialog
scripts/tauri/prebuild.mjs   Assembles the standalone Next.js server + sidecar Node binary before a Tauri build
```

## Scripts

- `pnpm dev` — start the web dev server
- `pnpm build` / `pnpm start` — production build and serve (web)
- `pnpm lint` — ESLint
- `pnpm tauri:dev` — run the desktop app in development
- `pnpm tauri:build` — build the desktop installer for the current OS
