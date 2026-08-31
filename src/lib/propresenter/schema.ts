import path from "node:path";
import protobuf from "protobufjs";

let rootPromise: Promise<protobuf.Root> | null = null;

/**
 * Loads the vendored, reverse-engineered ProPresenter 7 schema once per server
 * process. We enter through presentation.proto (rather than the bundle's
 * propresenter.proto, which only declares Playlist/Settings documents) since
 * that's the file that actually declares `rv.data.Presentation`, and its
 * import graph transitively pulls in everything a presentation document needs
 * (cues, actions, slides, graphics, RTF text).
 */
function loadRoot(): Promise<protobuf.Root> {
  if (!rootPromise) {
    const entry = path.join(process.cwd(), "vendor/propresenter7-proto/proto/presentation.proto");
    rootPromise = protobuf.load(entry);
  }
  return rootPromise;
}

export async function getPresentationType(): Promise<protobuf.Type> {
  const root = await loadRoot();
  return root.lookupType("rv.data.Presentation");
}
