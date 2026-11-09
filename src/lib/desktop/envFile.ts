import fs from "node:fs/promises";
import path from "node:path";
import { getAppConfigDir } from "./appConfigDir";
import { isDesktopServer } from "./desktopServer";
import { assertSafeEnvEntry, parseUserEnv, type UserEnvKey } from "./envEntry";

const ENV_FILENAME = ".env";

/** Only the keys the app manages come back, so the next save also drops any other line. */
async function readEnvFile(): Promise<Map<UserEnvKey, string>> {
  let content: string;
  try {
    content = await fs.readFile(path.join(getAppConfigDir(), ENV_FILENAME), "utf8");
  } catch {
    return new Map();
  }
  return parseUserEnv(content);
}

async function writeEnvFile(entries: Map<UserEnvKey, string>): Promise<void> {
  for (const [key, value] of entries) assertSafeEnvEntry(key, value);
  const dir = getAppConfigDir();
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, ENV_FILENAME);
  const content = Array.from(entries, ([key, value]) => `${key}=${value}`).join("\n") + "\n";
  await fs.writeFile(filePath, content, "utf8");
}

/** e.g. "sk-or-v1-ab12" -> "sk-or••••ab12" — never round-trips the full key back to the client. */
function maskApiKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 5)}••••${key.slice(-4)}`;
}

export async function getMaskedApiKey(keyName: UserEnvKey): Promise<string | null> {
  const key = (await readEnvFile()).get(keyName);
  return key ? maskApiKey(key) : null;
}

/** The packaged app gets these keys from Rust's `load_user_env` at spawn, but nothing
 * reads the file under plain `next dev`, so without this the keys saved in Ajustes are
 * lost on every dev server restart. Never overrides: in the packaged app Rust has already
 * set them, and a developer's own `.env.local` should win. */
export async function loadDesktopEnv(): Promise<void> {
  if (!isDesktopServer()) return;
  for (const [key, value] of await readEnvFile()) {
    process.env[key] ??= value;
  }
}

/** Persists the key to disk and applies it to the running server process
 * immediately, so it takes effect without an app restart. */
export async function saveApiKey(keyName: UserEnvKey, apiKey: string): Promise<string> {
  const entries = await readEnvFile();
  entries.set(keyName, apiKey);
  await writeEnvFile(entries);
  process.env[keyName] = apiKey;
  return maskApiKey(apiKey);
}
