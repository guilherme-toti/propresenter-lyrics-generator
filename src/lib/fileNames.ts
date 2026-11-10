/** Filename rules shared by the export and the Backgrounds screen. Nothing imported, so
 * `node --test` can load it. */

/** What a filename can't hold on macOS or Windows. */
const UNSAFE_FILE_NAME_CHARACTERS = /[\\/:*?"<>|]/g;

export function stripUnsafeFileNameCharacters(name: string): string {
  return name.replace(UNSAFE_FILE_NAME_CHARACTERS, "").trim();
}

/** The name to try when `fileName` is taken: "Nome (2).ext", then "(3)", … Attempt 1 is the name
 * itself. */
export function numberedFileName(fileName: string, attempt: number): string {
  if (attempt <= 1) return fileName;
  const dot = fileName.lastIndexOf(".");
  const hasExtension = dot > 0;
  const base = hasExtension ? fileName.slice(0, dot) : fileName;
  const ext = hasExtension ? fileName.slice(dot) : "";
  return `${base} (${attempt})${ext}`;
}
