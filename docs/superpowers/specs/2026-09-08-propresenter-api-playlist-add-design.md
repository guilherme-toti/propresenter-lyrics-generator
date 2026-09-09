# Adding exported presentations to a playlist via ProPresenter's HTTP API

Date: 2026-09-08
Status: approved, not yet implemented
Replaces: the file-writing approach introduced in `ab9f4da`

## Problem

`ab9f4da` made "Exportar" add the exported presentation to the active playlist by
decoding the playlist's `PlaylistDocument` protobuf, appending an item, and
re-encoding it. The song never appears in the playlist.

The write itself is correct. Investigation on 2026-09-08 confirmed the appended
items land in the right playlist, are well-formed, and are adopted by
ProPresenter — but only after a restart:

- `Playlists/Library` was rewritten at 17:01:00, the same second as the export.
- Decoding it showed both test items present in the target playlist, with valid
  `documentPath` URLs.
- They became visible in ProPresenter only after a full quit and relaunch, at
  which point ProPresenter renamed them to the real document names and resolved
  their `presentation_uuid`s.

**Root cause: ProPresenter reads playlist documents into memory at launch and
never re-reads them while running.** A correct write is invisible until restart.

This is worse than invisibility. ProPresenter keeps its own in-memory copy and
writes it back on its own schedule — confirmed independently: an API write at
17:15 left the file's mtime at 17:07, so ProPresenter had the change in memory
and had not yet flushed it. Any file write we make behind a running ProPresenter
can therefore be overwritten by its next save.

`README.md` predicted exactly this before the feature was written, and
`ab9f4da` proceeded anyway without updating the note.

## Decision

Add to the playlist through ProPresenter's local HTTP API instead of by editing
the playlist file. Delete the file-writing path entirely.

The fallback of writing the file when the API is unreachable was considered and
rejected. Its only justification was the ProPresenter-closed case, where a file
write is genuinely safe because there is no in-memory copy to lose to. This app
is only ever used with ProPresenter open (confirmed with the user), so that
window never opens: every file write would land in the one situation known to be
broken. Keeping it would mean maintaining a second code path that is always the
unreliable one.

## Non-goals

- Playlist discovery stays on folder scanning (`scanPlaylistFolder`,
  `usePlaylistWatcher`). The API could list playlists live, but that is a
  separate change and the current picker works.
- No Bonjour/mDNS discovery, no auto-detection of ProPresenter's port. The port
  is discoverable from the OS process table, but that needs separate macOS and
  Windows implementations in the Rust shell for little gain over one setting.
- No live-updates subscription (`/v1/playlist/{id}/updates`).

## Verified API behaviour

Probed against ProPresenter 21.4 (`api_version: v1`) on 2026-09-08. Recorded
here because several of these contradict ProPresenter's own OpenAPI document,
served at `/v1/doc/swagger.json`.

| Endpoint | Behaviour |
| --- | --- |
| `GET /version` | `{name, platform, os_version, host_description, api_version}` — used by the connection test |
| `GET /v1/libraries` | `[{uuid, name, index}]` |
| `GET /v1/library/{library_id}` | `{update_type, items: [{uuid, name, index}]}` — name is the filename without `.pro` |
| `GET /v1/playlist/{playlist_id}` | `{id, items: [...]}` |
| `PUT /v1/playlist/{playlist_id}` | **Sets** the contents. Returns `204`. |

Sharp edges, each of which cost a failed attempt during the spike:

1. **`PUT` replaces, it does not append.** Adding one item means GET, map every
   existing item into the PUT shape, append, then PUT the whole array.
2. **`target_uuid` is declared `nullable` but rejects `null`.** Headers and
   placeholders need `""`. Sending `null` fails with
   `invalid type: null, expected a string`.
3. **`PUT` regenerates every item's `id.uuid`.** Names, types, `header_color`
   and `presentation_info` survive; item identities do not. Accepted — see Risks.
4. **A newly written `.pro` is indexed in roughly 4 seconds** while ProPresenter
   runs, so its UUID is not available immediately after export. Needs a bounded
   poll, not a fixed sleep.
5. **Library names are NFD on macOS.** `É Ele (3)` from the API will not match an
   NFC JavaScript string. Both sides need `.normalize("NFC")`.

The presentation item shape that works:

```json
{
  "id": { "uuid": "<presentation uuid>", "name": "É Ele", "index": 5 },
  "type": "presentation",
  "is_hidden": false,
  "is_pco": false,
  "target_uuid": "<presentation uuid>",
  "presentation_info": {
    "presentation_uuid": "<presentation uuid>",
    "arrangement_name": "",
    "arrangement_uuid": ""
  }
}
```

## Design

### `src/lib/propresenter/api.ts` (new)

A thin client over the endpoints above, following `playlist.ts`'s conventions:
module-level functions, no class, best-effort. Base URL is
`http://127.0.0.1:{port}` — loopback only, matching the rest of the desktop
shell.

- `pingProPresenter(baseUrl)` → `{name, hostDescription}` or throws
- `findLibraryPresentation(baseUrl, name)` → polls libraries and their items
  until an NFC-normalised name match appears; bounded at ~10s with a 500ms
  interval; returns the presentation UUID or `null` on timeout
- `appendToPlaylist(baseUrl, playlistId, presentation)` → GET, map, append, PUT

`toPutItem(item, index)` — mapping one GET item to its PUT form — is a pure
function exported for testing. It is where the corruption risk lives:
`target_uuid` falls back to `""`, `header_color` / `presentation_info` /
`is_hidden` / `is_pco` are carried through untouched, and `index` is renumbered.

### Configuration

`proApiPort: number | null` added to `desktopStore`, persisted alongside the
existing folder settings, with `persistedDesktopStateSchema` extended to match.

`SettingsDialog` gains a port field next to the folder pickers and a **Testar
conexão** button. The button calls a new `POST /api/propresenter/ping` route,
which is `isDesktopServer()`-gated like the other desktop-only routes, and
reports the result inline: on success the `host_description` and `name` from
`/version` (e.g. "ProPresenter 21.4 em Guilhermes-MacBook-Pro-2"), on failure a
message explaining that ProPresenter must be running with Network enabled.

Because there is no fallback, an unset or wrong port means the feature does not
run at all. The connection test is how the user finds that out deliberately
rather than by a silently missing playlist entry.

### `POST /api/playlists/add-item` (changed contract)

`playlistsFolder` is dropped from the body; `port` is added. The route resolves
the presentation UUID and appends via the API.

```ts
{ added: true } | { added: false, reason: string }
```

`reason` is a user-facing Portuguese message describing what failed — port not
configured, ProPresenter unreachable, presentation not indexed in time, playlist
no longer present, or the PUT being rejected.

### Error surfacing

Per the user's requirement, an API failure is shown rather than silently
swallowed. The export itself still succeeds — the `.pro` is in the Library — so
this is not an export error and must not use the thrown-error path.

`SavedInfo` gains `playlistError: string | null`. The existing success notice
renders the failure beneath the success line, reusing the red text style already
used by the export error box:

| Outcome | Message |
| --- | --- |
| Added | Música importada com sucesso! Adicionada à playlist **X**. |
| Failed | Música importada com sucesso! Procure por **X** no ProPresenter e arraste para a playlist **Y**. — *Falha ao adicionar à playlist: {reason}* |
| No playlist selected | unchanged from today |

### Deletions

`addPresentationToPlaylist`, `findLeafNode` and `NIL_UUID` are removed from
`src/lib/propresenter/playlist.ts`. `scanPlaylistFolder` and its helpers stay —
playlist discovery is unchanged.

This also removes a latent defect rather than fixing it: the deleted code passed
`platform: "PLATFORM_MACOS"` as a string, and `protobufjs.encode()` accepts only
numeric enums, so it silently encoded as `0` (`PLATFORM_UNKNOWN`).
`PlaylistItem.verify()` reports `enum value expected` on it.

### `README.md`

The note at line 109 explaining why the export does not write into the playlist
is stale — `ab9f4da` reversed that decision without updating it. Rewritten to
keep the original reasoning, which was correct, and name the API as the
mechanism that makes adding safe: ProPresenter owns the playlist document while
it runs, so we ask it to make the change instead of editing the file underneath
it. The new Ajustes port setting is documented alongside the folder settings.

## Risks

- **Read-modify-write race.** A playlist edit made between our GET and PUT is
  lost. The window is milliseconds and the user is the same person driving both
  apps, so this is accepted rather than mitigated.
- **Item UUID churn.** Every PUT regenerates all `id.uuid` values. Planning
  Center links are the realistic casualty; the user does not use Planning
  Center, so this is accepted and recorded rather than tested.
- **ProPresenter must be running with Network enabled.** With the fallback
  removed this is a hard requirement for playlist adding. Export to the Library
  is unaffected and still works with ProPresenter closed.
- **Undocumented API behaviour.** Points 2 and 3 above contradict ProPresenter's
  published spec and could change between versions. The connection test reports
  `host_description`, which is the signal if a future version breaks this.

## Testing

Pure functions carry the corruption risk and are tested directly:

- `toPutItem` — the `""`-not-`null` rule, `header_color` and `presentation_info`
  preservation, sequential reindexing, and that a presentation item round-trips
  unchanged
- the NFC/NFD name matcher, using the real `É Ele (3)` case in both forms

The HTTP calls are verified manually against a live ProPresenter, documented as
a checklist in the implementation plan. ProPresenter is deliberately not mocked:
every defect found during the spike came from its behaviour diverging from its
own specification, which a mock built from that specification would reproduce
faithfully and uselessly.
