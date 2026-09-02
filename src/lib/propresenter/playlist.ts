import fs from "node:fs/promises";
import path from "node:path";
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
