# PMA Lyrics Studio

Turn a song into a bilingual (Português/English), line-by-line lyric alignment and export it straight to a ProPresenter 7 `.pro` file — no PDF, no manual re-typing in ProPresenter. Built for a church that only ever presents in these two languages: Editor A is always Português, Editor B is always English.

## How it works

Every song goes through the same pipeline — **align → preview → export** — but there are two ways to get to the alignment:

- **Generate with AI** (default, recommended) — search the Musixmatch catalogue by song title or a lyric snippet, then pick the exact recording from the results (if nothing matches, or the catalogue isn't configured, "Criar manualmente" is the only option). Picking a recording settles which song it is outright — from there an LLM via [OpenRouter](https://openrouter.ai) only decides the picked recording's language and whether a separately-recorded official version exists in the other language, and produces a Português/English pair already split into sections and aligned line-by-line (Editor A always ends up Português, regardless of which language the song was actually written in). You land straight on the alignment preview to review before exporting. See [How "Generate with AI" finds a translation](#how-generate-with-ai-finds-a-translation) for what happens between those two steps.
- **Create manually** — paste one language into Editor A and the other into Editor B (blank line = new section), then click "Alinhar letra" to pair them line-by-line and section-by-section, editable afterwards. Once aligned, "Realinhar com IA" can send both texts back through the LLM to fix missing lines, duplicates, or misalignment.

From there, both flows share the same alignment editor (reorder, split, merge, or retitle any section) and the same **Export → .pro** step, which builds a real ProPresenter 7 presentation: one slide per group of N lines, grouped into ProPresenter slide groups per section, with the song's CCLI/title/artist/key metadata attached.

### How "Generate with AI" finds a translation

Worship songs in this repertoire usually have *two real recordings* rather than a song and a translation of it — "Oceans" (Hillsong UNITED) also exists as the officially recorded "Oceanos", whose Portuguese lyrics are a singable adaptation, not a literal translation. Asking one LLM call for "the lyrics, already paired line-by-line with the other language" quietly forces the literal translation instead: a real adapted recording rarely maps 1:1 onto the original's lines, so a model told to produce matching pairs will translate rather than recall. Recall and alignment therefore happen in separate steps (`src/lib/ai/openrouter.ts`):

1. **Identify** — the song itself is already certain (it's the recording you picked); this call only decides what language its lyrics are actually in, and whether a separately *recorded* official version exists in the other language (in whichever direction: an English song's Português version, or a Português song's English one). Small, fast call. It's told to answer "no" whenever it isn't sure, since an invented "official" version is worse than an honest literal translation.
2. **Recall** — the picked recording's own lyrics come straight from Musixmatch by its exact catalogue ID — no AI call, nothing to "recall". Only when an official version is confirmed to exist is *it* recalled: first via a fuzzy Musixmatch lookup by its released title and artist, falling back to an AI call only if that lookup finds nothing. Neither source is allowed to translate anything.
3. **Pair** — a third call lines the two versions up by *musical position* (which line is sung at the same moment), preserving both recordings' wording verbatim and only filling in a literal translation where one version genuinely has no counterpart line.

When no official recording is found — the common case for smaller songs — none of that runs: it falls back to Musixmatch's own translation of the exact picked recording first, which costs zero AI calls and lines up 1:1 by construction whenever it exists and the line/section counts match. Only when Musixmatch has nothing usable does it ask the model to translate the picked recording's lyrics literally. Every failure in the multi-step path degrades to that same fallback, so the feature can only add quality, never break generation. The song's metadata card shows which path produced it ("tradução oficial" vs "tradução por IA").

All of this rests on how well the configured model *remembers* specific recordings, so `OPENROUTER_MODEL` is the setting most worth experimenting with — small models tend not to know Português worship adaptations and will silently substitute a literal translation of their own.

## Tech stack

- **Next.js 16** (App Router, Turbopack, React 19)
- **TypeScript**, **Zod** for schema validation at every trust boundary (AI responses, export payloads)
- **Tailwind CSS 4**
- **Zustand** (+ `persist`) for the local song library — everything lives in the browser's `localStorage`; there is no backend database
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

The exact same app also ships as a native installable desktop app via [Tauri](https://tauri.app): a small Rust shell opens the OS's native webview (WebView2 on Windows, WebKit on macOS) and points it at a bundled copy of this same Next.js app, run as a background sidecar process — no separate backend, no Chromium bundled, no code fork. The web app's studio, AI generation, and `.pro` download all work identically; the desktop build additionally knows how to export straight into a ProPresenter Library folder (see below).

### Prerequisites

- Node.js 20+ and npm (already needed for the web app) — this repo commits `package-lock.json` as the single source of truth for dependency versions, so use `npm` rather than `pnpm`/`yarn` for installs to avoid a second, drifting lockfile
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
- **Linux**: `bundle/deb/*.deb`, `bundle/rpm/*.rpm`, `bundle/appimage/*.AppImage`

### Auto-update

The installed app checks for a newer release on every launch (background check, doesn't block opening) and, if one's found, asks "Uma nova versão está disponível. Atualizar agora?" before downloading and installing it — see `check_for_updates()` in `src-tauri/src/lib.rs`. It's driven entirely by [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds and signs installers for all three platforms whenever a `vX.Y.Z` tag is pushed:

1. Bump `version` in `src-tauri/tauri.conf.json` (e.g. `"0.2.0"`).
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. Wait for the "Release desktop app" GitHub Action to finish building all three platforms (~10-15 min) — it creates a **draft** GitHub Release with every installer attached, plus a `latest.json` manifest the updater reads.
4. Review the draft release on GitHub and click **Publish**. Nothing goes out to existing installs until you do this — publishing is what makes `releases/latest/...` resolve to this version.

Update signing needs a one-time setup (already done for this repo — see the person who set it up if you need to rotate the key): a signing keypair (`npx tauri signer generate`), with the private key stored as the `TAURI_SIGNING_PRIVATE_KEY` repo secret (Settings → Secrets and variables → Actions) and the public key embedded in `tauri.conf.json`'s `plugins.updater.pubkey`. Losing the private key means old installs can never verify a future update again — back it up somewhere safe (password manager), not just in CI.

**Linux note:** the updater plugin only supports auto-update through the AppImage build — `.deb`/`.rpm` installs are managed by the system's own package manager instead and won't self-update. Not a concern for Windows/macOS, which is what this app actually targets.

### Configuring `OPENROUTER_API_KEY` and `MUSIXMATCH_API_KEY` for the installed app

The packaged app doesn't read `.env.local` (that's a `next dev`/web-only convention). Instead, open **Ajustes** and paste each key into its own field ("Chave da OpenRouter", "Chave da Musixmatch") — the app writes it to a `.env` file in its own config directory and applies it immediately, no restart needed:

- **Windows**: `%APPDATA%\com.pma.lyricsstudio\.env`
- **macOS**: `~/Library/Application Support/com.pma.lyricsstudio/.env`

Once saved, Ajustes only ever shows each key masked (e.g. `sk-or••••ab12`) — pasting a new value is the only way to change it. Without `OPENROUTER_API_KEY` configured, the app runs fine and the manual (non-AI) flow works exactly as in the browser. Without `MUSIXMATCH_API_KEY`, catalogue search/lyrics lookup is unavailable.

### Exporting straight into ProPresenter, and auto-detecting the current playlist

Open **Ajustes** (the gear icon in the header — desktop app only) to configure:

- **Pasta da Library** — a ProPresenter Library folder. Once set, clicking "Exportar" writes the `.pro` file straight into it (no download dialog) instead of downloading it; the ProPresenter Library panel already reads that folder natively, so the presentation shows up there.
- **Pasta de Playlists** — your ProPresenter `Playlists` folder. The app polls it every ~20s for playlists it hasn't seen before (e.g. a new one you just created for this week's service) and asks "Nova playlist encontrada: '<nome>'. Usar ela como destino?" — accepting just sets a label shown alongside the export button, reminding you which playlist to drag the exported presentation into.

**Why the export doesn't write directly into the playlist itself:** in ProPresenter 7, a *Playlist* isn't a folder — it's a structured document (same protobuf family as `.pro` files, see `vendor/propresenter7-proto/proto/playlist.proto`) that references presentations elsewhere on disk. Editing that document from outside ProPresenter while it might be open and live-presenting risks corrupting it or losing the change to ProPresenter's own autosave. Writing into the Library instead is the same effect with none of that risk: the file appears where ProPresenter already expects new presentations, and dragging it into the current playlist is one click. If the playlist you had selected gets deleted or renamed before your next export, the app notices and asks you to pick another before it writes the file.

## Project structure

```
src/app/                     Routes: the studio page, API routes (generate-song, export/propresenter)
src/components/studio/       New-song dialog, lyric editors, alignment preview, export panel
src/components/library/      Sidebar listing saved songs (Zustand-persisted)
src/lib/alignment.ts         Pure functions: splitting lyrics into sections, pairing lines, slide grouping
src/lib/ai/                  OpenRouter prompt/schema/response → Song mapping
src/lib/useGenerateSong.ts   Shared "Generate with AI" flow
src/lib/propresenter/        .pro document builder/encoder, Playlist document scanner/decoder, protobuf schema loaders
src/lib/desktopStore.ts      Zustand store for desktop-only settings (Library/Playlists folders, active playlist)
src/lib/desktop/             usePlaylistWatcher (Playlists-folder polling), envFile.ts (reads/writes the desktop .env — API key)
src/components/settings/     Ajustes dialog + the shared playlist picker modal
vendor/propresenter7-proto/  Vendored ProPresenter 7 .proto schema (unofficial, reverse-engineered)
src-tauri/                   Tauri (Rust) desktop shell — bundled server, native windows, folder-picker dialog
scripts/tauri/prebuild.mjs   Assembles the standalone Next.js server + sidecar Node binary before a Tauri build
```

## Scripts

- `npm run dev` — start the web dev server
- `npm run build` / `npm run start` — production build and serve (web)
- `npm run lint` — ESLint
- `npm run tauri:dev` — run the desktop app in development
- `npm run tauri:build` — build the desktop installer for the current OS
