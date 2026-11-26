---
name: release-app
description: Commits and pushes the finished work, then releases PMA Lyrics Studio (the Tauri desktop app for Windows and macOS). Gates the tree, lands one conventional commit through `land`, picks the bump (patch for fixes, minor for features), dispatches `bump-version.yml`, watches `release.yml` until every OS build is green and the draft is published (that is what the in-app updater serves), syncs the bot's bump commit, and reports the version, the release link and what to test on the church Windows PC. Use only when the user asks for a build in the same breath as the commit — "commit, push and build a new version", "commit, push, build a version", "commit, push and make a new version", "commit, push and build a release", "commit, push, build - devtools still on", "faz commit, push e gera uma versão nova", "builda uma versão" — or when a `release.yml` run failed and needs recovering.
---

# Release PMA Lyrics Studio

The app ships only as the desktop app. The web version and its Vercel deploy were dropped on 2026-11-09 (`8438ac7 chore: drop the web version`), so there is no Vercel step. If the user says "make sure vercel works", reply that nothing deploys there any more.

A push to `main` reaches nobody. Installed apps update only to a **published** release: on every launch they read `releases/latest/download/latest.json` and ask "Uma nova versão do PMA Lyrics Studio está disponível (X.Y.Z). Atualizar agora?". So a release goes to the church's computers as soon as it is published. Release only when the user asks.

| What | Where |
|---|---|
| Bump, commit, tag, push, then watch the build | `.github/workflows/bump-version.yml` (input `bump`: patch, minor or major; pushes with `RELEASE_PAT`) |
| Build three OSes into a draft, publish only when all are green | `.github/workflows/release.yml` (matrix: macos universal, ubuntu-22.04, windows-latest, then the `publish` job) |
| The version | `src-tauri/tauri.conf.json` `version` only. The bot bumps it, so never edit it by hand. |
| DevTools in release builds | `src-tauri/Cargo.toml`: `tauri = { …, features = ["devtools"] }` |
| The human guide | `README.md`, the release section |

Copy this checklist and tick it as you go:

```
- [ ] 1 Recall  - [ ] 2 Preconditions  - [ ] 3 DevTools  - [ ] 4 Gate + land
- [ ] 5 Level with origin  - [ ] 6 Bump  - [ ] 7 Dispatch + watch  - [ ] 8 Verify
- [ ] 9 Sync  - [ ] 10 Record  - [ ] 11 Report
```

## Steps

Run every command from the repo root, on `main`.

1. **Recall.** Dispatch `knowledge-keeper` with `MODE: RECALL`: "PMA Lyrics Studio release: last version, open drafts or stray tags, DevTools state, traps of past runs." Let it run in the background while you do step 2.
2. **Meet the prompt's preconditions first.** "As soon as everything runs and there's no follow-up", "fix it then", "none for now": finish that work, including any browser check still running, before you commit. If it fails or leaves a follow-up, stop and report. Don't release.
3. **DevTools: do what the user says. Otherwise leave it as it is.** It is off from v0.9.8 on; v0.9.6 and v0.9.7 shipped with it on (`d122b8b`) to debug a Windows hang. Turn it on again only to debug a release build.
   - "devtools still on", or nothing said: leave `Cargo.toml` alone.
   - "devtools off" or "turn off devtools": set `features = []` on the `tauri =` line of `src-tauri/Cargo.toml`. It's a one-line change, and `Cargo.lock` doesn't change. Land it as its own commit, `chore(desktop): disable devtools in release builds`.
   - "turn devtools on": the reverse, `chore(desktop): enable devtools in release builds`.
   - Either way, say the current state in the report.
4. **Gate, then land through `land`.** Run the Skill tool with `land` and this args line: "commit and push only; the release is handled by release-app". `land` surveys the branch, gates the exact tree, commits and pushes. This repo's full gate is:

   ```sh
   npx tsc --noEmit && npx eslint \
     && node --test $(git ls-files '*.test.mts') $(git ls-files --others --exclude-standard '*.test.mts') \
     && npx next build
   ```

   - Add `(cd src-tauri && cargo check)` when anything under `src-tauri/` changed.
   - `next build` is safe to run while a dev server is up, because dev uses `.next/dev`.
   - **Only this task's files.** Other sessions often leave uncommitted work here (for example `scripts/library-audit/*` and `src/lib/fileNames*`). Stage by path. Never use `git add -A`. Name what you left out in the report.
   - Use one conventional commit per finished unit, usually just one: `fix(backgrounds): …`, `feat(search): …`, `chore(desktop): …`.
   - Pull before you commit: `git pull --rebase`. The bot's last "Bump version to vX.Y.Z" commit is often missing locally.
5. **Level with origin, or stop.** The workflow builds `origin/main`, not your checkout. Before you dispatch:

   ```sh
   git fetch origin && git status -sb | head -1 && test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" && echo level
   ```

   - Run this as its own command, and dispatch only after it prints `level`.
   - Never chain the dispatch after `git push` with `;`. On 2026-11-15 a push was rejected, the chained dispatch still ran, and v0.9.3 was tagged and started building without the fix (see step 7, "Wrong tree").
6. **Pick the bump.**
   - If the user named a bump or a version, use it.
   - Otherwise read the commits since the last tag: `git log $(git describe --tags --abbrev=0 origin/main)..origin/main --format=%s`.
     - Any `feat` → `minor`. Past examples: v0.7.0, v0.8.0, v0.9.0.
     - Only fixes and chores → `patch`.
     - `major` only on the user's word.
   - Say it in one line, for example "patch: 0.9.7 → v0.9.8", and go on. The user already asked for the release.
7. **Dispatch and watch.**

   ```sh
   gh workflow run bump-version.yml --ref main -f bump=<patch|minor|major>   # prints the run URL; the id is its last segment
   ```

   - Watch that run in the background (`run_in_background: true`): `gh run watch <bump-run-id> --exit-status`.
   - Its last step follows the `release.yml` run and fails if that run fails. So one watch covers both, about 10 to 15 minutes (v0.9.5: 9m43s; v0.9.6: 12m17s). The README allows up to 25.
   - Tell the user it's building, then wait for the notification. Don't poll.
   - Find the release run by its tag, never with `--limit 1`: `gh run list --workflow=release.yml --branch vX.Y.Z --json databaseId,status,conclusion,url`.
   - **Wrong tree.** If you learn the build started on a tree without the work (a rejected push, a missing commit), cancel the `release.yml` run before `publish` runs: `gh run cancel <id>`. Then confirm `gh release list --limit 3` still shows the old `Latest`. Leave the tag that was pushed, and land and release again as the next patch.
8. **Verify it's published.**

   ```sh
   gh run view <release-run-id> --json jobs -q '.jobs[]|"\(.name): \(.conclusion)"'
   gh release view vX.Y.Z --json isDraft,url,assets -q '"draft=\(.isDraft) \(.url)", (.assets[].name)'
   ```

   - Done means all three build jobs and `publish` succeeded, and `draft=false`.
   - The assets must include `latest.json`, the Windows `.msi` and `-setup.exe` with their `.sig` files, and the `_universal.dmg`.
   - If the bump run only warned "Could not find the triggered release.yml run", find the run by its tag (step 7) and watch it yourself.
   - **If an OS job failed:** `publish` is skipped and the release stays a draft. That is the safety net, and nothing reached users.
     - Read `gh run view <id> --log-failed` and name the failing job and step.
     - Infra or flaky (a runner, a network fetch, the linuxdeploy/AppImage step): `gh run rerun <id> --failed`. This is safe because `release.yml` has no bump step, and `publish` still waits for every build to be green.
     - Cause in the code: fix it on `main` and ship it as the next patch. The failed `vX.Y.Z` stays a draft with its tag.
     - Never hand-publish a draft that `publish` skipped. Never move, delete or re-push a tag. Deleting a stray draft or tag is the user's call.
     - **Never touch the `v0.4.0` draft** (unpublished since 2026-11-09).
9. **Sync.** Run `git pull --rebase`. The bot pushed "Bump version to vX.Y.Z" to `main`, so your checkout is one commit behind. Rebase, don't merge: `30c942e` is the merge commit that came from skipping this.
10. **Record.** Dispatch `knowledge-keeper` with `MODE: RECORD`. Include the version and date, the bump, the run URL, what it carried, the DevTools state, and any trap this run hit: a failed job and its cause, a stray tag, a cancelled build. Skip it for a routine green run whose only news is the version number.
11. **Report.** Keep it short and in the user's language:
    - **Version and link:** "**vX.Y.Z is published**: <release URL>", or "draft only: <job> failed at <step>".
    - **Commit:** its sha and subject, plus the uncommitted files you left out.
    - **DevTools:** on or off.
    - **On the church Windows PC:**
      1. Open PMA Lyrics Studio. It asks "Atualização disponível … (X.Y.Z). Atualizar agora?". Click to update and let it restart.
      2. Give one plain step per user-visible change in `git log v<previous>..vX.Y.Z --format=%s`, leaving out bump commits. Name the screen and button as the app does, and say what should happen. Example: "In Backgrounds, turn an image into a video. It should finish in a few seconds, not stay on processing."
      3. If DevTools is on and something goes wrong: press Ctrl+Shift+I (or right-click → Inspect), open the Console tab, and send everything shown there.

## Never

- Release without the user asking, or as a side effect of "commit and push" alone.
- Dispatch before step 5 prints `level`.
- Edit `tauri.conf.json`'s version, or create or push a `v*` tag by hand, when the workflow is working.
- Rerun `bump-version.yml` after it pushed a bump. That bumps a second time. Check `git fetch origin --tags` first, and rerun only `release.yml`.
- Force-push. Never touch `v0.4.0`.
