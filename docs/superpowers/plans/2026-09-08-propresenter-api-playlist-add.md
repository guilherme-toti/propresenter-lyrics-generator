# ProPresenter API Playlist Add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the exported presentation to the active ProPresenter playlist through ProPresenter's local HTTP API, so it appears immediately, and delete the playlist-file-writing code that only worked after a restart.

**Architecture:** A new `src/lib/propresenter/api.ts` client talks to ProPresenter on `http://127.0.0.1:{port}`. After the `.pro` is written to the Library, the app polls the API until ProPresenter has indexed the new presentation, then does a read-modify-write of the playlist (`GET` items, append, `PUT` the whole array back). The port is a new persisted setting with a connection test. There is no fallback: if the API fails, the export still succeeds and the failure is shown to the user.

**Tech Stack:** Next.js (App Router) / TypeScript, Zod for route bodies, Zustand (persisted) for desktop settings, Tauri desktop shell. No test framework — pure functions get Node's built-in runner (`node --test`, `.test.mts`), matching `src/lib/lyrics/musixmatch.test.mts`. Network code is verified manually against a live ProPresenter, matching this codebase's existing convention.

**Spec:** `docs/superpowers/specs/2026-09-08-propresenter-api-playlist-add-design.md`

## Global Constraints

- All user-facing copy is Portuguese (pt-BR), matching the rest of the app.
- ProPresenter is reached on loopback only: `http://127.0.0.1:{port}`. Never a hostname, never a non-local address.
- No new npm dependencies. Use global `fetch` and `AbortSignal.timeout`.
- Desktop-only API routes are gated with `isDesktopServer()` and return 404 when it is false, matching `src/app/api/playlists/add-item/route.ts` and the settings routes.
- Tests are `.test.mts` files run with `node --test <path>`. Import source modules with an explicit `.ts` extension (e.g. `from "./api.ts"`), as `musixmatch.test.mts` does.
- ProPresenter's OpenAPI document is wrong in three places (see spec). Trust the spec's "Verified API behaviour" table over the served `swagger.json`.

---

### Task 1: Pure helpers for the playlist PUT body

The whole corruption risk of this feature lives in these two pure functions: mapping ProPresenter's `GET` item shape into the shape its `PUT` accepts, and matching a filename against a library entry across Unicode normalisation forms. They are tested directly; everything else in the client is I/O.

**Files:**
- Create: `src/lib/propresenter/api.ts`
- Test: `src/lib/propresenter/api.test.mts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface PlaylistApiItem { id: { uuid: string; name: string; index: number }; type: string; is_hidden?: boolean; is_pco?: boolean; header_color?: unknown; presentation_info?: PresentationInfo | null }`
  - `interface PresentationInfo { presentation_uuid: string; arrangement_name?: string; arrangement_uuid?: string }`
  - `toPutItem(item: PlaylistApiItem, index: number): Record<string, unknown>`
  - `presentationItem(presentationUuid: string, name: string, index: number): Record<string, unknown>`
  - `namesMatch(a: string, b: string): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/propresenter/api.test.mts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { namesMatch, presentationItem, toPutItem, type PlaylistApiItem } from "./api.ts";

const header: PlaylistApiItem = {
  id: { uuid: "1E546E96-F193-4344-8BE1-FF07E3029354", name: "Music", index: 1 },
  type: "header",
  is_hidden: false,
  is_pco: false,
  header_color: { red: 0.28, green: 0.6, blue: 0.78, alpha: 1 },
};

const presentation: PlaylistApiItem = {
  id: { uuid: "1F736F53-907E-4949-8AE4-D970EFFFC2B1", name: "É Ele (2)", index: 3 },
  type: "presentation",
  is_hidden: false,
  is_pco: false,
  presentation_info: {
    presentation_uuid: "1186633D-57AB-4952-8898-885B8A77D473",
    arrangement_name: "",
    arrangement_uuid: "",
  },
};

test("gives an itemless entry an empty-string target_uuid, never null", () => {
  // ProPresenter's own OpenAPI document declares target_uuid nullable, but its
  // deserializer rejects null with "invalid type: null, expected a string".
  const result = toPutItem(header, 1);

  assert.equal(result.target_uuid, "");
});

test("takes target_uuid from presentation_info for a presentation item", () => {
  const result = toPutItem(presentation, 3);

  assert.equal(result.target_uuid, "1186633D-57AB-4952-8898-885B8A77D473");
  assert.deepEqual(result.presentation_info, presentation.presentation_info);
});

test("preserves header_color so re-writing a playlist doesn't flatten its headers", () => {
  const result = toPutItem(header, 1);

  assert.deepEqual(result.header_color, { red: 0.28, green: 0.6, blue: 0.78, alpha: 1 });
});

test("omits header_color and presentation_info when the source item has neither", () => {
  const placeholder: PlaylistApiItem = {
    id: { uuid: "F589DE7D-41CD-4AA2-A983-EAA2F4CBAC28", name: "Placeholder", index: 0 },
    type: "placeholder",
  };

  const result = toPutItem(placeholder, 0);

  assert.equal("header_color" in result, false);
  assert.equal("presentation_info" in result, false);
  assert.equal(result.is_hidden, false);
  assert.equal(result.is_pco, false);
});

test("renumbers index to the item's new position", () => {
  const result = toPutItem(presentation, 7) as { id: { index: number; uuid: string } };

  assert.equal(result.id.index, 7);
  assert.equal(result.id.uuid, "1F736F53-907E-4949-8AE4-D970EFFFC2B1");
});

test("builds a new presentation item that carries its uuid in both places", () => {
  const uuid = "FB3619D9-97A1-48BF-9BD5-C60CCDFFF873";

  const result = presentationItem(uuid, "É Ele (3)", 5) as {
    id: { uuid: string; name: string; index: number };
    type: string;
    target_uuid: string;
    presentation_info: { presentation_uuid: string };
  };

  assert.equal(result.type, "presentation");
  assert.equal(result.target_uuid, uuid);
  assert.equal(result.presentation_info.presentation_uuid, uuid);
  assert.deepEqual(result.id, { uuid, name: "É Ele (3)", index: 5 });
});

test("matches library names across macOS NFD and JavaScript NFC forms", () => {
  // The API returns names read from the filesystem, where macOS stores "É" as
  // NFD (E + combining acute). A name built in JS is NFC. Comparing them raw
  // silently finds nothing.
  const fromApi = "É Ele (3)".normalize("NFD");
  const fromExport = "É Ele (3)".normalize("NFC");

  assert.notEqual(fromApi, fromExport);
  assert.equal(namesMatch(fromApi, fromExport), true);
});

test("does not match genuinely different names", () => {
  assert.equal(namesMatch("É Ele (3)", "É Ele (2)"), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/propresenter/api.test.mts`
Expected: FAIL — cannot find module `./api.ts`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/propresenter/api.ts`:

```ts
/**
 * Client for ProPresenter's local HTTP API (ProPresenter 21.x, `api_version: v1`),
 * used to add an exported presentation to a playlist.
 *
 * Why this exists at all rather than editing the playlist file: ProPresenter reads
 * playlist documents into memory at launch and never re-reads them while running, so
 * a correct file write is invisible until restart and can be overwritten by
 * ProPresenter's own next save. See the design doc for the evidence.
 *
 * ProPresenter serves its own OpenAPI document at /v1/doc/swagger.json. It is wrong
 * in ways that matter here — the deviations are called out at each site below.
 */

export interface PresentationInfo {
  presentation_uuid: string;
  arrangement_name?: string;
  arrangement_uuid?: string;
}

/** One item as returned by `GET /v1/playlist/{id}`. */
export interface PlaylistApiItem {
  id: { uuid: string; name: string; index: number };
  type: string;
  is_hidden?: boolean;
  is_pco?: boolean;
  header_color?: unknown;
  presentation_info?: PresentationInfo | null;
}

/**
 * Maps one item from the shape `GET` returns into the shape `PUT` accepts. They are
 * not the same shape: `PUT` requires `target_uuid`, which `GET` never sends.
 *
 * `index` is passed in rather than read from the item because a `PUT` rewrites the
 * whole list and positions must be contiguous.
 */
export function toPutItem(item: PlaylistApiItem, index: number): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: { ...item.id, index },
    type: item.type,
    is_hidden: item.is_hidden ?? false,
    is_pco: item.is_pco ?? false,
    // Declared `nullable` in ProPresenter's OpenAPI document, but its deserializer
    // rejects null outright: "invalid type: null, expected a string". Headers and
    // placeholders have no target object, so they take an empty string.
    target_uuid: item.presentation_info?.presentation_uuid ?? "",
  };
  // Only sent when present — a null header_color on a non-header is rejected the
  // same way target_uuid's null is.
  if (item.header_color != null) out.header_color = item.header_color;
  if (item.presentation_info != null) out.presentation_info = item.presentation_info;
  return out;
}

/** A brand-new playlist entry pointing at a presentation already indexed in a library. */
export function presentationItem(
  presentationUuid: string,
  name: string,
  index: number,
): Record<string, unknown> {
  return {
    id: { uuid: presentationUuid, name, index },
    type: "presentation",
    is_hidden: false,
    is_pco: false,
    target_uuid: presentationUuid,
    presentation_info: {
      presentation_uuid: presentationUuid,
      arrangement_name: "",
      arrangement_uuid: "",
    },
  };
}

/**
 * Library names come from the filesystem, where macOS stores accented characters
 * decomposed (NFD); a name built in JavaScript is composed (NFC). "É Ele" from the
 * API and "É Ele" from an export are different strings until both are normalised.
 */
export function namesMatch(a: string, b: string): boolean {
  return a.normalize("NFC") === b.normalize("NFC");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/propresenter/api.test.mts`
Expected: PASS — `# pass 8`, `# fail 0`.

- [ ] **Step 5: Confirm the existing suite still passes**

Run: `node --test src/lib/lyrics/musixmatch.test.mts`
Expected: PASS — `# pass 10`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/propresenter/api.ts src/lib/propresenter/api.test.mts
git commit -m "Add pure helpers for ProPresenter playlist PUT bodies"
```

---

### Task 2: HTTP calls against ProPresenter

The three network functions. These are not unit-tested — see the spec's testing rationale: every defect found while designing this came from ProPresenter diverging from its own specification, which a mock built from that specification would reproduce faithfully and uselessly. They are verified against a live instance at the end of this task.

**Files:**
- Modify: `src/lib/propresenter/api.ts` (append to the file from Task 1)

**Interfaces:**
- Consumes: `toPutItem`, `presentationItem`, `namesMatch`, `PlaylistApiItem` from Task 1
- Produces:
  - `pingProPresenter(port: number): Promise<{ name: string; hostDescription: string }>`
  - `findLibraryPresentation(port: number, name: string): Promise<string | null>`
  - `appendToPlaylist(port: number, playlistId: string, presentationUuid: string, name: string): Promise<void>`
  - All three reject with an `Error` carrying a Portuguese message on failure.

- [ ] **Step 1: Add the request helper and constants**

Append to `src/lib/propresenter/api.ts`:

```ts
/** Loopback only: ProPresenter runs on the same machine as this app. */
function baseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

const REQUEST_TIMEOUT_MS = 5_000;
/** ProPresenter indexed a freshly written .pro in ~4s during testing; 15s is headroom. */
const INDEX_TIMEOUT_MS = 15_000;
const INDEX_POLL_INTERVAL_MS = 500;

async function apiRequest(port: number, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl(port)}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(
      "Não foi possível falar com o ProPresenter. Verifique se ele está aberto e se a rede está ativada nas preferências.",
    );
  }
  if (!res.ok) {
    throw new Error(`O ProPresenter respondeu ${res.status} em ${path}.`);
  }
  return res;
}
```

- [ ] **Step 2: Add `pingProPresenter`**

Append to `src/lib/propresenter/api.ts`:

```ts
/** Backs the "Testar conexão" button — `/version` is the cheapest proof of life. */
export async function pingProPresenter(
  port: number,
): Promise<{ name: string; hostDescription: string }> {
  const res = await apiRequest(port, "/version");
  const data = (await res.json()) as { name?: string; host_description?: string };
  return {
    name: data.name ?? "desconhecido",
    hostDescription: data.host_description ?? "ProPresenter",
  };
}
```

- [ ] **Step 3: Add `findLibraryPresentation`**

Append to `src/lib/propresenter/api.ts`:

```ts
/**
 * Finds a just-exported presentation's UUID by the name it has in a library, polling
 * because ProPresenter indexes a newly written .pro asynchronously — about 4 seconds
 * in testing. Returns null if it never shows up within INDEX_TIMEOUT_MS.
 *
 * `name` is the exported filename without its .pro extension, which is exactly what
 * ProPresenter uses as the library item's name.
 */
export async function findLibraryPresentation(port: number, name: string): Promise<string | null> {
  const deadline = Date.now() + INDEX_TIMEOUT_MS;

  do {
    const librariesRes = await apiRequest(port, "/v1/libraries");
    const libraries = (await librariesRes.json()) as Array<{ uuid: string }>;

    for (const library of libraries) {
      const itemsRes = await apiRequest(port, `/v1/library/${library.uuid}`);
      const body = (await itemsRes.json()) as { items?: Array<{ uuid: string; name: string }> };
      const match = body.items?.find((item) => namesMatch(item.name, name));
      if (match) return match.uuid;
    }

    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, INDEX_POLL_INTERVAL_MS));
  } while (Date.now() < deadline);

  return null;
}
```

- [ ] **Step 4: Add `appendToPlaylist`**

Append to `src/lib/propresenter/api.ts`:

```ts
/**
 * Appends a presentation to a playlist.
 *
 * `PUT /v1/playlist/{id}` *sets* the playlist's contents — there is no append
 * endpoint — so this reads the current items, maps them into PUT shape, adds ours,
 * and writes the whole array back. Two consequences worth knowing:
 *
 *  - ProPresenter mints new `id.uuid` values for every item on each write. Names,
 *    types, header colours and presentation targets survive; item identities do not.
 *  - A playlist edit made in ProPresenter between the GET and the PUT is lost. The
 *    window is milliseconds and the same person drives both apps, so this is accepted.
 */
export async function appendToPlaylist(
  port: number,
  playlistId: string,
  presentationUuid: string,
  name: string,
): Promise<void> {
  const res = await apiRequest(port, `/v1/playlist/${playlistId}`);
  const playlist = (await res.json()) as { items?: PlaylistApiItem[] };
  const existing = playlist.items ?? [];

  const body = [
    ...existing.map((item, index) => toPutItem(item, index)),
    presentationItem(presentationUuid, name, existing.length),
  ];

  await apiRequest(port, `/v1/playlist/${playlistId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 5: Verify against a live ProPresenter**

Requires ProPresenter running with Preferences → Network enabled. Substitute your own port and playlist UUID.

```bash
PORT=62830
curl -s "http://127.0.0.1:$PORT/version"
curl -s "http://127.0.0.1:$PORT/v1/playlists"
```

Expected: the first returns JSON including `host_description` and `api_version: "v1"`; the second lists playlists with `uuid` values matching what the app's playlist picker shows.

- [ ] **Step 6: Confirm the pure tests still pass**

Run: `node --test src/lib/propresenter/api.test.mts`
Expected: PASS — `# pass 8`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/propresenter/api.ts
git commit -m "Add ProPresenter HTTP client for library lookup and playlist writes"
```

---

### Task 3: Port setting, connection test, and the Ajustes row

The port is per-install (62830 on the development machine, not ProPresenter's documented default), so it has to be configured. With no fallback path, a wrong port means the feature silently does nothing — the connection test is how the user finds that out deliberately.

**Files:**
- Modify: `src/lib/desktopStore.ts:17-23` (schema), `:25-45` (interface), `:47-67` (store body)
- Create: `src/app/api/propresenter/ping/route.ts`
- Modify: `src/components/settings/SettingsDialog.tsx`

**Interfaces:**
- Consumes: `pingProPresenter` from Task 2
- Produces:
  - `useDesktopStore` gains `proApiPort: number | null` and `setProApiPort(port: number | null): void`
  - `POST /api/propresenter/ping` with body `{ port: number }` → `{ ok: true, name, hostDescription }` or `{ ok: false, error }`

- [ ] **Step 1: Add `proApiPort` to the store**

In `src/lib/desktopStore.ts`, add to `persistedDesktopStateSchema`:

```ts
  proApiPort: z.number().int().positive().nullable().optional(),
```

Add to the `DesktopState` interface, after `playlistsFolder`:

```ts
  /** Port of ProPresenter's local HTTP API (Preferences → Network). Per-install. */
  proApiPort: number | null;
```

and to the actions block:

```ts
  setProApiPort: (port: number | null) => void;
```

Add to the store body, after `playlistsFolder: null`:

```ts
      proApiPort: null,
```

and after `setPlaylistsFolder`:

```ts
      setProApiPort: (port) => set({ proApiPort: port }),
```

Leave `version: 0` alone: `migrate` runs the persisted state through `safeParse`, and the new key is `.optional()`, so existing stored state keeps validating and `proApiPort` falls back to the `null` default.

- [ ] **Step 2: Create the ping route**

Create `src/app/api/propresenter/ping/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { isDesktopServer } from "@/lib/desktop/envFile";
import { pingProPresenter } from "@/lib/propresenter/api";

const bodySchema = z.object({ port: z.number().int().positive() });

/** Desktop-only: backs the "Testar conexão" button in Ajustes. A failed connection is a
 * reportable result, not a request error, so it comes back 200 with ok:false. */
export async function POST(request: Request) {
  if (!isDesktopServer()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Porta inválida." }, { status: 400 });
  }

  try {
    const { name, hostDescription } = await pingProPresenter(parsed.data.port);
    return NextResponse.json({ ok: true, name, hostDescription });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao conectar.",
    });
  }
}
```

- [ ] **Step 3: Add the port row to Ajustes**

In `src/components/settings/SettingsDialog.tsx`, add this component next to `FolderRow` (it follows the same `section > h3 + p + row` structure, and reuses the existing `Input` and `Button` imports):

```tsx
function ProApiPortRow() {
  const proApiPort = useDesktopStore((s) => s.proApiPort);
  const setProApiPort = useDesktopStore((s) => s.setProApiPort);
  const [value, setValue] = useState(proApiPort ? String(proApiPort) : "");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const save = (raw: string) => {
    setValue(raw);
    setResult(null);
    const port = Number.parseInt(raw, 10);
    setProApiPort(Number.isInteger(port) && port > 0 ? port : null);
  };

  const test = async () => {
    const port = Number.parseInt(value, 10);
    if (!Number.isInteger(port) || port <= 0) {
      setResult({ ok: false, message: "Informe uma porta válida." });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/propresenter/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port }),
      });
      const data = await res.json();
      setResult(
        data.ok
          ? { ok: true, message: `Conectado: ${data.hostDescription} em ${data.name}` }
          : { ok: false, message: data.error ?? "Falha ao conectar." },
      );
    } catch {
      setResult({ ok: false, message: "Falha ao conectar." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-ink">Porta do ProPresenter</h3>
      <p className="mb-2 text-xs text-ink/60">
        Ative Preferências → Rede no ProPresenter e informe a porta mostrada lá. Sem isso, a música
        é exportada para a Library mas não entra na playlist automaticamente.
      </p>
      <div className="flex items-center gap-2">
        <Input
          className="flex-1"
          inputMode="numeric"
          placeholder="ex.: 62830"
          value={value}
          onChange={(e) => save(e.target.value)}
        />
        <Button variant="secondary" size="sm" onClick={test} disabled={testing}>
          {testing ? "Testando…" : "Testar conexão"}
        </Button>
      </div>
      {result && (
        <p className={`mt-2 text-xs ${result.ok ? "text-ink/60" : "text-red-600"}`}>
          {result.message}
        </p>
      )}
    </section>
  );
}
```

Then render `<ProApiPortRow />` inside `SettingsDialog`'s body, immediately after the playlists `FolderRow` (around line 215-220), so the ProPresenter-connection settings sit together.

- [ ] **Step 4: Verify in the running app**

Run the desktop app: `npm run tauri:dev`

In Ajustes, enter your ProPresenter port and click **Testar conexão**.
Expected: `Conectado: ProPresenter 21.4 em <your machine name>`.

Then enter a wrong port (e.g. `1`) and click it again.
Expected: the red "Não foi possível falar com o ProPresenter…" message.

Close and reopen the app.
Expected: the port is still there — confirming it persisted through the Zustand schema change.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/desktopStore.ts src/app/api/propresenter/ping/route.ts src/components/settings/SettingsDialog.tsx
git commit -m "Add ProPresenter API port setting with a connection test"
```

---

### Task 4: Switch the add-item route to the API and delete the file-writing code

This is where the reported bug is actually fixed. The route stops decoding and rewriting the playlist protobuf and asks ProPresenter to make the change instead.

**Files:**
- Modify: `src/app/api/playlists/add-item/route.ts` (rewrite)
- Modify: `src/lib/propresenter/playlist.ts` (delete `addPresentationToPlaylist`, `findLeafNode`, `NIL_UUID`, and the now-unused `pathToFileURL` import)

**Interfaces:**
- Consumes: `findLibraryPresentation`, `appendToPlaylist` from Task 2
- Produces: `POST /api/playlists/add-item` with body `{ port: number, playlistId: string, presentationName: string }` → `{ added: true }` or `{ added: false, reason: string }` where `reason` is Portuguese and user-facing.
- Breaking: `playlistsFolder` and `presentationPath` are no longer accepted. `presentationName` is the exported filename without its `.pro` extension. Task 5 updates the only caller.

- [ ] **Step 1: Rewrite the route**

Replace the whole contents of `src/app/api/playlists/add-item/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { isDesktopServer } from "@/lib/desktop/envFile";
import { appendToPlaylist, findLibraryPresentation } from "@/lib/propresenter/api";

const bodySchema = z.object({
  port: z.number().int().positive(),
  playlistId: z.string().min(1),
  /** The exported filename without ".pro" — what ProPresenter names the library item. */
  presentationName: z.string().min(1),
});

/** Desktop-only, called right after a successful export to the Library, to also add the new
 * presentation to the selected playlist via ProPresenter's HTTP API.
 *
 * A false `added` is not a request error: the export itself already succeeded and the file is
 * safely in the Library. The caller surfaces `reason` to the user rather than failing the export.
 * There is deliberately no file-writing fallback — writing the playlist document behind a running
 * ProPresenter is invisible until restart and gets overwritten by its next save, which is the bug
 * this route exists to fix. */
export async function POST(request: Request) {
  if (!isDesktopServer()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const { port, playlistId, presentationName } = parsed.data;

  try {
    const presentationUuid = await findLibraryPresentation(port, presentationName);
    if (!presentationUuid) {
      return NextResponse.json({
        added: false,
        reason: "O ProPresenter ainda não indexou a apresentação na biblioteca.",
      });
    }

    await appendToPlaylist(port, playlistId, presentationUuid, presentationName);
    return NextResponse.json({ added: true });
  } catch (err) {
    return NextResponse.json({
      added: false,
      reason: err instanceof Error ? err.message : "Falha ao adicionar à playlist.",
    });
  }
}
```

- [ ] **Step 2: Delete the playlist-file-writing code**

In `src/lib/propresenter/playlist.ts`, delete:

- the `import { pathToFileURL } from "node:url";` line
- `const NIL_UUID = ...`
- the whole `findLeafNode` function and its doc comment
- the whole `addPresentationToPlaylist` function and its doc comment

Keep `loadRoot`, `PlaylistSummary`, `PlaylistDocument`, `PlaylistNode`, `DOC_TYPE_PRESENTATION`, `collectPlaylists` and `scanPlaylistFolder` — playlist discovery is unchanged and still reads these files.

This also removes a latent defect rather than fixing it: the deleted code passed `platform: "PLATFORM_MACOS"` as a string, and `protobufjs.encode()` accepts only numeric enums, so it silently encoded as `0` (`PLATFORM_UNKNOWN`).

- [ ] **Step 3: Verify nothing else referenced the deleted code**

Run: `grep -rn "addPresentationToPlaylist\|findLeafNode\|NIL_UUID" src/`
Expected: no output.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Note the intermediate state this task leaves behind: `ExportFab` still posts the old body (`playlistsFolder`, `presentationPath`, `name`), which the new Zod schema rejects with a 400. TypeScript cannot catch this — the body is a `JSON.stringify` argument, not a typed call — so the app compiles cleanly while every playlist add reports `added: false` until Task 5 updates the caller. Expected, and fixed there.

- [ ] **Step 5: Verify the route directly**

With `npm run tauri:dev` running and ProPresenter open, export any song to the Library first so there is something to find, then:

```bash
curl -s -X POST http://127.0.0.1:3100/api/playlists/add-item \
  -H "Content-Type: application/json" \
  -d '{"port":62830,"playlistId":"<your playlist uuid>","presentationName":"<exported name>"}'
```

Expected: `{"added":true}`, and the presentation appears at the bottom of that playlist **in ProPresenter immediately, without restarting it**. That is the fix.

Then repeat with a name that does not exist.
Expected: `{"added":false,"reason":"O ProPresenter ainda não indexou a apresentação na biblioteca."}` after roughly 15 seconds.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/playlists/add-item/route.ts src/lib/propresenter/playlist.ts
git commit -m "Add to playlists via ProPresenter's API instead of editing the file"
```

---

### Task 5: Report the outcome honestly in the export notice

The export succeeds whether or not the playlist add does, so a failure here is not an export error and must not use the thrown-error path. It is shown beneath the success line.

**Files:**
- Modify: `src/components/studio/ExportFab.tsx:13-17` (`SavedInfo`), `:55-97` (`exportToLibrary`), `:192-215` (the saved notice)
- Modify: `README.md:106-109`

**Interfaces:**
- Consumes: `POST /api/playlists/add-item` from Task 4
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Widen `SavedInfo`**

In `src/components/studio/ExportFab.tsx`, replace the `SavedInfo` interface:

```ts
interface SavedInfo {
  title: string;
  playlistName: string | null;
  addedToPlaylist: boolean;
  /** Why the playlist add failed, shown to the user. Null when it succeeded or wasn't attempted. */
  playlistError: string | null;
}
```

- [ ] **Step 2: Call the new route contract**

In `exportToLibrary`, replace the whole `let addedToPlaylist = false; if (...) {...}` block and the `setSaved({...})` call that follows it with:

```ts
    // Best-effort: the file is already safely in the Library, so a failure here never fails the
    // export — it's reported to the user instead. Needs the API port configured (Ajustes) and
    // ProPresenter running with Network enabled; there is no file-writing fallback, because
    // writing the playlist document behind a running ProPresenter is invisible until restart.
    let addedToPlaylist = false;
    let playlistError: string | null = null;
    const exportedName = typeof data.savedTo === "string" ? baseNameWithoutExt(data.savedTo) : null;

    if (activePlaylist && exportedName) {
      if (!proApiPort) {
        playlistError = "Configure a porta do ProPresenter em Ajustes para adicionar automaticamente.";
      } else {
        try {
          const res = await fetch("/api/playlists/add-item", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              port: proApiPort,
              playlistId: activePlaylist.id,
              presentationName: exportedName,
            }),
          });
          const result = await res.json();
          addedToPlaylist = Boolean(result?.added);
          if (!addedToPlaylist) playlistError = result?.reason ?? "Falha ao adicionar à playlist.";
        } catch {
          playlistError = "Falha ao adicionar à playlist.";
        }
      }
    }

    setSaved({
      title: overrides?.fileName || song.title || "sua música",
      playlistName: activePlaylist?.name ?? null,
      addedToPlaylist,
      playlistError,
    });
```

- [ ] **Step 3: Read the port from the store**

Add alongside the other `useDesktopStore` selectors near line 44:

```ts
  const proApiPort = useDesktopStore((s) => s.proApiPort);
```

`playlistsFolder` is still used elsewhere in this component for the playlist picker, so leave that selector in place.

- [ ] **Step 4: Show the failure in the notice**

In the saved notice, add the error line immediately after the closing `</p>` of the existing message paragraph and before the close button:

```tsx
          {saved.playlistError && (
            <p className="mt-1 flex-1 text-red-600">
              Falha ao adicionar à playlist: {saved.playlistError}
            </p>
          )}
```

Note the surrounding `<p className="flex-1">…</p>` already closes before this; the new paragraph is a sibling inside the same flex container.

- [ ] **Step 5: Update the README**

In `README.md`, replace the bullet at line 107 and the "Why the export doesn't write directly into the playlist itself" paragraph at line 109 with:

```markdown
- **Pasta de Playlists** — your ProPresenter `Playlists` folder. The app polls it every ~20s for playlists it hasn't seen before (e.g. a new one you just created for this week's service) and asks "Nova playlist encontrada: '<nome>'. Usar ela como destino?" — accepting sets it as the export destination.
- **Porta do ProPresenter** — the port from ProPresenter's Preferences → Network. With it set, "Exportar" also adds the presentation to the selected playlist; **Testar conexão** confirms the app can reach ProPresenter.

**Why the playlist add goes through ProPresenter's API rather than the playlist file:** in ProPresenter 7, a *Playlist* isn't a folder — it's a structured document (same protobuf family as `.pro` files, see `vendor/propresenter7-proto/proto/playlist.proto`). ProPresenter reads that document into memory at launch and never re-reads it while running, so editing it from outside is invisible until a restart and gets overwritten by ProPresenter's own next save. Asking the running ProPresenter to make the change instead is immediate and safe. It does require ProPresenter to be open with Network enabled — without that, the export still writes into the Library and tells you to drag it in.
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Verify the three outcomes end to end**

Run `npm run tauri:dev` with ProPresenter open and a playlist selected.

1. **Success** — port configured correctly. Export a song.
   Expected: "Música importada com sucesso! Adicionada à playlist **X**." and the song is in that playlist in ProPresenter **without restarting it**.
2. **Port not configured** — clear the port in Ajustes. Export again.
   Expected: the "procure e arraste" message plus the red "Configure a porta do ProPresenter em Ajustes…" line.
3. **ProPresenter unreachable** — set the port to `1`. Export again.
   Expected: the "procure e arraste" message plus the red "Não foi possível falar com o ProPresenter…" line. The `.pro` is still in the Library in all three cases.

- [ ] **Step 8: Run the full test suite**

Run: `node --test src/lib/propresenter/api.test.mts src/lib/lyrics/musixmatch.test.mts`
Expected: PASS — `# pass 18`, `# fail 0`.

- [ ] **Step 9: Commit**

```bash
git add src/components/studio/ExportFab.tsx README.md
git commit -m "Report playlist-add failures instead of silently exporting to the Library"
```

---

## Verification checklist

After all tasks:

- [ ] `node --test src/lib/propresenter/api.test.mts src/lib/lyrics/musixmatch.test.mts` — 18 passing
- [ ] `npx tsc --noEmit` — clean
- [ ] `npm run lint` — clean
- [ ] `grep -rn "addPresentationToPlaylist" src/` — no output
- [ ] Exporting with a valid port puts the song in the playlist in a **running** ProPresenter, with no restart
- [ ] Exporting with a bad port still writes the `.pro` to the Library and shows the failure
