import path from "node:path";
import protobuf from "protobufjs";

let rootPromise: Promise<protobuf.Root> | null = null;

/**
 * Loads the vendored, reverse-engineered ProPresenter 7 schema once per server
 * process. We enter through presentation.proto (rather than the bundle's
 * propresenter.proto, which only declares Playlist/Settings documents) since
 * that's the file that actually declares `rv.data.Presentation`, and its
 * import graph transitively pulls in everything a presentation document needs
 * (cues, actions, slides, graphics, RTF text). The workspace's Macros and Props
 * documents are declared in their own entry files, so those are loaded into the
 * same root alongside it.
 */
function loadRoot(): Promise<protobuf.Root> {
  if (!rootPromise) {
    const protoDir = path.join(process.cwd(), "vendor/propresenter7-proto/proto");
    rootPromise = protobuf.load(
      ["presentation.proto", "macros.proto", "propDocument.proto"].map((file) => path.join(protoDir, file)),
    );
  }
  return rootPromise;
}

export async function getPresentationType(): Promise<protobuf.Type> {
  const root = await loadRoot();
  return root.lookupType("rv.data.Presentation");
}

/** `Configuration/Macros` in a ProPresenter workspace. */
export async function getMacrosDocumentType(): Promise<protobuf.Type> {
  const root = await loadRoot();
  return root.lookupType("rv.data.MacrosDocument");
}

/** `Configuration/Props` in a ProPresenter workspace. */
export async function getPropDocumentType(): Promise<protobuf.Type> {
  const root = await loadRoot();
  return root.lookupType("rv.data.PropDocument");
}
