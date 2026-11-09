/** Set only by the Tauri sidecar (src-tauri/src/lib.rs) and the `tauri:dev:next` script, so a
 * bare `next build` or `next dev` on a developer's machine never picks up the keys their
 * installed app saved. */
export function isDesktopServer(): boolean {
  return process.env.PMA_DESKTOP_APP === "1";
}
