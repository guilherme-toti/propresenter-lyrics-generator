import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import protobuf from "protobufjs";

let rootPromise: Promise<protobuf.Root> | null = null;

function loadRoot(): Promise<protobuf.Root> {
  if (!rootPromise) {
    // Enter through propresenter.proto, not playlist.proto directly: every
    // file ProPresenter writes into its "Playlists" folder (confirmed against
    // real files from a user's ProPresenter workspace) is a PlaylistDocument
    // envelope — application info, a document `type`, and the actual
    // Playlist tree under `root_node` — not a bare Playlist message.
    const entry = path.join(process.cwd(), "vendor/propresenter7-proto/proto/propresenter.proto");
    rootPromise = protobuf.load(entry);
  }
  return rootPromise;
}

export interface PlaylistSummary {
  /** The playlist's own UUID, stable across renames — used to detect "already seen". */
  id: string;
  name: string;
  /** File this playlist was decoded from, relative to the scanned folder. */
  sourceFile: string;
}

/** PlaylistDocument.Type.TYPE_PRESENTATION — the rest (TYPE_MEDIA, TYPE_AUDIO,
 * and the untyped "PlaylistTemplates" document) aren't song/presentation
 * playlists a user would export lyrics into. */
const DOC_TYPE_PRESENTATION = 1;

interface PlaylistDocument {
  type?: number;
  rootNode?: PlaylistNode;
}

interface PlaylistNode {
  uuid?: { string?: string };
  name?: string;
  playlists?: { playlists?: PlaylistNode[] };
  items?: { items?: unknown[] };
}

/**
 * Walks a Playlist tree collecting every leaf a user would recognize as "a
 * playlist" in ProPresenter's own sidebar. There's no reliable `type` marker
 * for this in practice — real workspace files leave Playlist.type unset on
 * every node — so the actual signal is which side of the `oneof` is
 * populated: a node with nested `playlists` is a group (recurse into it
 * instead), one without is a real, selectable playlist (its `items` branch,
 * possibly still empty for a freshly created one).
 */
function collectPlaylists(node: PlaylistNode, sourceFile: string, out: PlaylistSummary[]) {
  const children = node.playlists?.playlists;
  if (children) {
    for (const child of children) collectPlaylists(child, sourceFile, out);
    return;
  }
  if (node.uuid?.string && node.name) {
    out.push({ id: node.uuid.string, name: node.name, sourceFile });
  }
}

/**
 * Best-effort scan of a ProPresenter "Playlists" folder: every file in it is
 * decoded as an `rv.data.PlaylistDocument` (unofficial, reverse-engineered
 * schema — see vendor/propresenter7-proto). Files that aren't
 * TYPE_PRESENTATION PlaylistDocuments — or aren't valid protobuf at all — are
 * silently skipped rather than thrown; this folder can reasonably contain
 * anything ProPresenter or the OS puts there.
 */
export async function scanPlaylistFolder(folder: string): Promise<PlaylistSummary[]> {
  const root = await loadRoot();
  const PlaylistDocumentType = root.lookupType("rv.data.PlaylistDocument");

  let entries: string[];
  try {
    entries = await fs.readdir(folder);
  } catch {
    return [];
  }

  const results: PlaylistSummary[] = [];
  for (const entry of entries) {
    const fullPath = path.join(folder, entry);
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) continue;

      const bytes = await fs.readFile(fullPath);
      const message = PlaylistDocumentType.decode(bytes);
      const plain = PlaylistDocumentType.toObject(message, { defaults: true }) as PlaylistDocument;

      if (plain.type !== DOC_TYPE_PRESENTATION || !plain.rootNode) continue;
      for (const child of plain.rootNode.playlists?.playlists ?? []) {
        collectPlaylists(child, entry, results);
      }
    } catch {
      continue;
    }
  }
  return results;
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/** Same leaf-vs-group distinction as collectPlaylists above, but returns the matching node itself
 * (to mutate) instead of collecting summaries. */
function findLeafNode(node: PlaylistNode, id: string): PlaylistNode | null {
  const children = node.playlists?.playlists;
  if (children) {
    for (const child of children) {
      const found = findLeafNode(child, id);
      if (found) return found;
    }
    return null;
  }
  return node.uuid?.string === id ? node : null;
}

/**
 * Adds a presentation item pointing at `presentation.absolutePath` to whichever playlist in
 * `folder` has `playlistId` as its UUID — the same effect as dragging the exported .pro file onto
 * that playlist in ProPresenter's own sidebar, done from disk instead. Returns false (not an
 * error) if no playlist with that id is found in any file in the folder, e.g. it was deleted or
 * renamed to a different document since it was picked.
 *
 * Mutates the decoded PlaylistDocument message in place and re-encodes the same message, rather
 * than round-tripping the whole document through toObject()/fromObject(): this schema has several
 * `oneof`s this feature has no reason to touch (smart_directory vs. pco_plan, playlists vs. items),
 * and toObject({defaults: true}) — needed to reliably tell a real playlist apart from a group, see
 * collectPlaylists — would materialize every alternative of every oneof in the entire document
 * with a zero-value message, which fromObject() would then write back as if all of them were
 * actually present. Decoding once, changing only the target node's item list, and re-encoding the
 * same object graph leaves every other byte of the file exactly as it was decoded.
 *
 * This is inherently best-effort: if ProPresenter has this exact file open and later saves its own
 * in-memory copy, that save can overwrite what's written here. There's no way to detect or avoid
 * that from outside the app — this is a known, accepted risk of writing into a live document (see
 * the README's "Why the export doesn't write directly into the playlist" note), not an oversight.
 */
export async function addPresentationToPlaylist(
  folder: string,
  playlistId: string,
  presentation: { name: string; absolutePath: string },
): Promise<boolean> {
  const root = await loadRoot();
  const PlaylistDocumentType = root.lookupType("rv.data.PlaylistDocument");

  let entries: string[];
  try {
    entries = await fs.readdir(folder);
  } catch {
    return false;
  }

  const newItem = {
    uuid: { string: crypto.randomUUID() },
    name: presentation.name,
    presentation: {
      documentPath: {
        platform: process.platform === "win32" ? "PLATFORM_WIN32" : "PLATFORM_MACOS",
        absoluteString: pathToFileURL(presentation.absolutePath).href,
      },
      arrangement: { string: NIL_UUID },
    },
  };

  for (const entry of entries) {
    const fullPath = path.join(folder, entry);
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) continue;

      const bytes = await fs.readFile(fullPath);
      const message = PlaylistDocumentType.decode(bytes);
      const view = message as unknown as PlaylistDocument;
      if (view.type !== DOC_TYPE_PRESENTATION || !view.rootNode) continue;

      let target: PlaylistNode | null = null;
      for (const child of view.rootNode.playlists?.playlists ?? []) {
        target = findLeafNode(child, playlistId);
        if (target) break;
      }
      if (!target) continue;

      target.items = { items: [...(target.items?.items ?? []), newItem] };

      const encoded = Buffer.from(PlaylistDocumentType.encode(message).finish());
      await fs.writeFile(fullPath, encoded);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}
