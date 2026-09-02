/** True when running inside the Tauri desktop shell rather than a plain browser tab. */
export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
