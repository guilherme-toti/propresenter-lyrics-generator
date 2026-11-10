import os from "node:os";
import path from "node:path";

const APP_IDENTIFIER = "com.pma.lyricsstudio";

/** Where this OS keeps per-user app data: what Rust's `dirs::config_dir()` returns, and where
 * ProPresenter keeps its own support files too. */
export function userAppDataDir(): string {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support");
  if (process.platform === "win32") return process.env.APPDATA || path.join(home, "AppData", "Roaming");
  return process.env.XDG_CONFIG_HOME || path.join(home, ".config");
}

/**
 * Mirrors Tauri's `app.path().app_config_dir()` (`dirs::config_dir().join(identifier)`
 * on the Rust side — see src-tauri/src/lib.rs) so the Next.js server can read/write
 * the same `.env` file the sidecar loads at startup, without Rust having to pass the
 * path in explicitly (this also has to work under plain `next dev`, which Rust never
 * spawns).
 */
export function getAppConfigDir(): string {
  return path.join(userAppDataDir(), APP_IDENTIFIER);
}

/** Where this OS keeps per-user caches: files the app can download again, so the OS or the user may
 * clear them without losing anything. */
function userCacheDir(): string {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Caches");
  if (process.platform === "win32") return process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  return process.env.XDG_CACHE_HOME || path.join(home, ".cache");
}

export function getAppCacheDir(): string {
  return path.join(userCacheDir(), APP_IDENTIFIER);
}
