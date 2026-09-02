import fs from "node:fs/promises";
import path from "node:path";
import protobuf from "protobufjs";

let rootPromise: Promise<protobuf.Root> | null = null;

function loadRoot(): Promise<protobuf.Root> {
  if (!rootPromise) {
    const entry = path.join(process.cwd(), "vendor/propresenter7-proto/proto/playlist.proto");
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

const TYPE_PLAYLIST = 1;

interface PlaylistNode {
  uuid?: { string?: string };
  name?: string;
  type?: number;
  playlists?: { playlists?: PlaylistNode[] };
}

function collectPlaylists(node: PlaylistNode, sourceFile: string, out: PlaylistSummary[]) {
  if (node.type === TYPE_PLAYLIST && node.uuid?.string && node.name) {
    out.push({ id: node.uuid.string, name: node.name, sourceFile });
  }
  for (const child of node.playlists?.playlists ?? []) {
    collectPlaylists(child, sourceFile, out);
  }
}

/**
 * Best-effort scan of a ProPresenter "Playlists" folder: every file in it is
 * decoded as an `rv.data.Playlist` document (unofficial, reverse-engineered
 * schema — see vendor/propresenter7-proto) and walked for named playlist
 * nodes (skipping groups/smart folders). Files that aren't valid Playlist
 * documents are silently skipped rather than thrown — this folder can
 * reasonably contain anything ProPresenter or the OS puts there.
 */
export async function scanPlaylistFolder(folder: string): Promise<PlaylistSummary[]> {
  const root = await loadRoot();
  const PlaylistType = root.lookupType("rv.data.Playlist");

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
      const message = PlaylistType.decode(bytes);
      const plain = PlaylistType.toObject(message, { defaults: true }) as PlaylistNode;
      collectPlaylists(plain, entry, results);
    } catch {
      continue;
    }
  }
  return results;
}
