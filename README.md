# PMA Lyrics Studio

Turn a song into a bilingual (Português/English), line-by-line lyric alignment and export it straight to a ProPresenter 7 `.pro` file — no PDF, no manual re-typing in ProPresenter. Built for a church that only ever presents in these two languages: Editor A is always Português, Editor B is always English.

## How it works

Every song goes through the same pipeline — **align → preview → export** — but there are two ways to get to the alignment:

- **Generate with AI** (default, recommended) — search the Musixmatch catalogue by song title or a lyric snippet, then pick the exact recording from the results (if nothing matches, or the catalogue isn't configured, "Criar manualmente" is the only option). Picking a recording settles which song it is outright — from there an LLM via [OpenRouter](https://openrouter.ai) only decides the picked recording's language and whether a separately-recorded official version exists in the other language, and produces a Português/English pair already split into sections and aligned line-by-line (Editor A always ends up Português, regardless of which language the song was actually written in). You land straight on the alignment preview to review before exporting. See [How "Generate with AI" finds a translation](#how-generate-with-ai-finds-a-translation) for what happens between those two steps.
- **Create manually** — paste one language into Editor A and the other into Editor B (blank line = new section), then click "Alinhar letra" to pair them line-by-line and section-by-section, editable afterwards. A repeated section only needs to be pasted once in one language: when the other editor writes out more repeats (a chorus sung 3× at the end), each repeat reuses the text already pasted for that section. Once aligned, "Realinhar com IA" can send both texts back through the LLM to fix missing lines, repeats, or misalignment — it reshapes and reuses the pasted text, never translates it.

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
- **Zustand** (+ `persist`) for the local song library — everything lives in the webview's `localStorage`; there is no backend database
- **protobufjs**, decoding/encoding against a vendored, reverse-engineered ProPresenter 7 `.proto` schema (`vendor/propresenter7-proto`, MIT licensed — see that folder's `README.md`)
- **Tauri 2** (Rust) ships the app as a native Windows/macOS/Linux desktop installer — see [Desktop app](#desktop-app-windowsmacos) below

## Desktop app (Windows/macOS)

The app is desktop-only, built with [Tauri](https://tauri.app): a small Rust shell opens the OS's native webview (WebView2 on Windows, WebKit on macOS) and points it at a bundled copy of this Next.js app, run as a background sidecar server on `127.0.0.1` — no separate backend, no Chromium bundled. There is no web deploy.

That server only answers the app's own pages: `src/proxy.ts` refuses (403) any `/api/*` request that doesn't name a loopback host, comes from another origin, or carries a body other than JSON, so a website open in the same machine's browser can't spend your OpenRouter credits or touch your files.

### Prerequisites

- Node.js 20+ and npm — this repo commits `package-lock.json` as the single source of truth for dependency versions, so use `npm` rather than `pnpm`/`yarn` for installs to avoid a second, drifting lockfile
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

This starts `next dev` on port 3100 (hot reload included, via `npm run tauri:dev:next`) and opens it in a native window. The manual flow works with no configuration; the AI flow needs `OPENROUTER_API_KEY`, either saved in **Ajustes** (see below) or set in a `.env.local` (`cp .env.example .env.local`), and otherwise fails gracefully with a message explaining how to configure it.

### Build an installer

```bash
npm run tauri:build
```

This runs `next build` with a standalone server output, bundles a copy of the local Node runtime as the app's sidecar (no system-wide Node install required on the end user's machine), and produces a platform-native installer under `src-tauri/target/release/bundle/`:

- **Windows**: `bundle/nsis/*.exe` and/or `bundle/msi/*.msi`
- **macOS**: `bundle/dmg/*.dmg` and `bundle/macos/*.app`
- **Linux**: `bundle/deb/*.deb`, `bundle/rpm/*.rpm`, `bundle/appimage/*.AppImage`

### Auto-update

The installed app checks for a newer release on every launch (background check, doesn't block opening) and, if one's found, asks "Uma nova versão está disponível. Atualizar agora?" before downloading and installing it — see `check_for_updates()` in `src-tauri/src/lib.rs`. Releases come from two GitHub Actions workflows: [`.github/workflows/bump-version.yml`](.github/workflows/bump-version.yml) ("Bump version and release") bumps the version and pushes a `vX.Y.Z` tag, and [`.github/workflows/release.yml`](.github/workflows/release.yml) ("Release desktop app") runs on every `v*` tag push, building and signing installers for all three platforms. To cut a release:

1. Run "Bump version and release" from the repo's **Actions** tab (**Run workflow** on `main`, choosing `patch`, `minor` or `major` for its `bump` input), or from a terminal:

   ```bash
   gh workflow run bump-version.yml --ref main -f bump=<patch|minor|major>
   ```

   Its `bump` job bumps `version` in `src-tauri/tauri.conf.json`, commits "Bump version to vX.Y.Z" to `main`, tags it `vX.Y.Z` and pushes both. It pushes with the `RELEASE_PAT` repo secret (a fine-grained PAT with Contents: Read and write), because a push made with the default `GITHUB_TOKEN` wouldn't trigger `release.yml`. Run `git pull` afterwards so your checkout has the bump commit.
2. Wait for "Release desktop app" (~10-25 min). Its `release` job builds macOS, Linux and Windows into a **draft** GitHub Release with every installer attached, plus a `latest.json` manifest the updater reads. The bump run's "Watch the release build" step follows that run and fails if it fails, so the bump run alone tells you how the release went (if it can't find the run within ~2.5 min it only warns — check the Actions tab then).
3. Once all three builds succeed, its `publish` job publishes the draft automatically — there's nothing to click. Publishing is what makes `releases/latest/...` resolve to this version, so that's when existing installs start updating.

If any platform fails, `publish` is skipped and the release stays a **draft**: nothing ships to existing installs until it's fixed.

To release without the bump workflow, bump `version` in `src-tauri/tauri.conf.json` yourself (it must match the tag), commit and push to `main`, then tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`. `release.yml` picks it up the same way.

Update signing needs a one-time setup (already done for this repo — see the person who set it up if you need to rotate the key): a signing keypair (`npx tauri signer generate`), with the private key stored as the `TAURI_SIGNING_PRIVATE_KEY` repo secret, its password (if it has one) as the `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repo secret (both under Settings → Secrets and variables → Actions), and the public key embedded in `tauri.conf.json`'s `plugins.updater.pubkey`. `release.yml` passes both secrets as environment variables to its `tauri-apps/tauri-action` step, and the Tauri CLI that step runs signs the update files with them. A key without a password needs no password secret, since an unset secret reaches the build as an empty string; a key with one fails to sign without it. So when you rotate the key, set or delete `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to match the new one. Losing the private key means old installs can never verify a future update again — back it up somewhere safe (password manager), not just in CI.

**Linux note:** the updater plugin only supports auto-update through the AppImage build — `.deb`/`.rpm` installs are managed by the system's own package manager instead and won't self-update. Not a concern for Windows/macOS, which is what this app actually targets.

### Configuring `OPENROUTER_API_KEY` and `MUSIXMATCH_API_KEY` for the installed app

The packaged app doesn't read `.env.local` (that's a `next dev` convention). Instead, open **Ajustes** and paste each key into its own field ("Chave da OpenRouter", "Chave da Musixmatch") — the app writes it to a `.env` file in its own config directory and applies it immediately, no restart needed:

- **Windows**: `%APPDATA%\com.pma.lyricsstudio\.env`
- **macOS**: `~/Library/Application Support/com.pma.lyricsstudio/.env`

Once saved, Ajustes only ever shows each key masked (e.g. `sk-or••••ab12`) — pasting a new value is the only way to change it. Without `OPENROUTER_API_KEY` configured, the app runs fine and the manual (non-AI) flow still works. Without `MUSIXMATCH_API_KEY`, catalogue search/lyrics lookup is unavailable.

That file only ever holds these two keys: both the Rust shell and the server ignore any other line in it (so it can't set `NODE_OPTIONS` or change the server's port), and the next save drops them.

### Google Drive on the Backgrounds screen

The tray's "Do Google Drive" buttons ("Pasta padrão", "Inserir link") browse a Drive folder and download the picked files into the tray. The app reads Drive as a **service account** (a Google account for apps, no sign-in), so the folder only has to be shared with that account's email, not made public. One-time setup, in a Google Cloud project:

1. **APIs & Services → Library**: enable the **Google Drive API**.
2. **IAM & Admin → Service Accounts → Create service account**. It needs no roles.
3. In the new account, **Keys → Add key → Create new key → JSON**, and keep the downloaded file somewhere private.
4. In the app, **Ajustes → Google Drive → Conta de serviço do Google → Escolher arquivo**, and pick that file. The app checks it with Google right away, then keeps a copy only the current user can read, as `google-service-account.json` in the same config directory as `.env`. Only the account's email ever goes back to the window.
5. Share the Drive folder with the email Ajustes shows ("Copiar e-mail") as **Viewer**. Optionally paste the folder's link in "Pasta padrão".

The account gets read-only Drive access and sees only what's shared with it. Google Workspace organisations that block sharing outside the organisation will refuse step 5; share from a personal account then, or ask the admin to allow it. Downloads are cached in the OS cache directory (`~/Library/Caches/com.pma.lyricsstudio/google-drive` on macOS) and deleted after 7 days unused.

### Exporting straight into ProPresenter, and auto-detecting the current playlist

Open **Ajustes** (the gear icon in the header) to configure:

- **Pasta da Library** — the ProPresenter Library folder the app exports into. Clicking "Enviar para ProPresenter" writes the `.pro` file straight into it; the ProPresenter Library panel already reads that folder natively, so the presentation shows up there. Until it's set, export asks you to choose it in Ajustes.
- **Porta do ProPresenter** — the port from ProPresenter's Preferences → Network. With it set, the app asks ProPresenter directly (via its local HTTP API) for the current playlists whenever the app window regains focus, and surfaces any it hasn't seen before (e.g. a new one you just created for this week's service) with "Nova playlist encontrada: '<nome>'. Usar ela como destino?" — accepting sets it as the export destination. It also lets "Enviar para ProPresenter" add the presentation to the selected playlist; **Testar conexão** confirms the app can reach ProPresenter.

**Why playlist discovery and the playlist add both go through ProPresenter's API rather than its files:** in ProPresenter 7, a *Playlist* isn't a folder — it's a structured document (same protobuf family as `.pro` files, see `vendor/propresenter7-proto/proto/playlist.proto`). ProPresenter reads that document into memory at launch and never re-reads it while running, so a file it wrote may not even be flushed yet, and editing it from outside is invisible until a restart and gets overwritten by ProPresenter's own next save. Asking the running ProPresenter directly instead is immediate, live, and safe. It does require ProPresenter to be open with Network enabled — without that, the export still writes into the Library and tells you to drag it in, and playlist discovery simply finds nothing to suggest.

## Project structure

```
src/app/                     Routes: the studio page, API routes (generate-song, export/propresenter)
src/proxy.ts                 Request guard every /api route sits behind (see src/lib/desktop/requestGuard.ts)
src/components/studio/       New-song dialog, lyric editors, alignment preview, export panel
src/components/library/      Sidebar listing saved songs (Zustand-persisted)
src/lib/alignment.ts         Pure functions: splitting lyrics into sections, pairing lines, slide grouping
src/lib/ai/                  OpenRouter prompt/schema/response → Song mapping
src/lib/useGenerateSong.ts   Shared "Generate with AI" flow
src/lib/propresenter/        .pro document builder/encoder, ProPresenter HTTP API client (playlist discovery/add), protobuf schema loaders
src/lib/desktopStore.ts      Zustand store for desktop-only settings (Library folder, ProPresenter API port, active playlist)
src/lib/desktop/             usePlaylistWatcher (fetches playlists from ProPresenter on window focus), envFile.ts (reads/writes the desktop .env — API key)
src/components/settings/     Ajustes dialog + the shared playlist picker modal
vendor/propresenter7-proto/  Vendored ProPresenter 7 .proto schema (unofficial, reverse-engineered)
src-tauri/                   Tauri (Rust) desktop shell — bundled server, native windows, folder-picker dialog
scripts/tauri/prebuild.mjs   Assembles the standalone Next.js server + sidecar Node binary before a Tauri build
```

## Scripts

- `npm run tauri:dev` — run the desktop app in development
- `npm run tauri:dev:next` — only the app's dev server on port 3100, without the native window (what `tauri:dev` starts first)
- `npm run build` — `next build`, producing the standalone server the installer bundles
- `npm run lint` — ESLint
- `npm run tauri:build` — build the desktop installer for the current OS
