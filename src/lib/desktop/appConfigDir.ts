import os from "node:os";
import path from "node:path";

const APP_IDENTIFIER = "com.pma.lyricsstudio";

/**
 * Mirrors Tauri's `app.path().app_config_dir()` (`dirs::config_dir().join(identifier)`
 * on the Rust side — see src-tauri/src/lib.rs) so the Next.js server can read/write
 * the same `.env` file the sidecar loads at startup, without Rust having to pass the
 * path in explicitly (this also has to work under plain `next dev`, which Rust never
 * spawns).
 */
export function getAppConfigDir(): string {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", APP_IDENTIFIER);
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, APP_IDENTIFIER);
  }
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdgConfigHome, APP_IDENTIFIER);
}
