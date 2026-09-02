import fs from "node:fs/promises";
import path from "node:path";
import { getAppConfigDir } from "./appConfigDir";

const ENV_FILENAME = ".env";
const API_KEY_NAME = "OPENROUTER_API_KEY";

/** Only ever set by the Tauri sidecar/dev process (see src-tauri/src/lib.rs and the
 * `tauri:dev:next` script) — a plain web deploy never sets this, so routes gated on
 * it 404 there instead of letting any visitor rewrite the shared deployment's env. */
export function isDesktopServer(): boolean {
  return process.env.PMA_DESKTOP_APP === "1";
}

async function readEnvFile(): Promise<Map<string, string>> {
  const filePath = path.join(getAppConfigDir(), ENV_FILENAME);
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return new Map();
  }

  const entries = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    entries.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  return entries;
}

async function writeEnvFile(entries: Map<string, string>): Promise<void> {
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

export async function getMaskedApiKey(): Promise<string | null> {
  const key = (await readEnvFile()).get(API_KEY_NAME);
  return key ? maskApiKey(key) : null;
}

/** Persists the key to disk and applies it to the running server process
 * immediately, so it takes effect without an app restart. */
export async function saveApiKey(apiKey: string): Promise<string> {
  const entries = await readEnvFile();
  entries.set(API_KEY_NAME, apiKey);
  await writeEnvFile(entries);
  process.env[API_KEY_NAME] = apiKey;
  return maskApiKey(apiKey);
}
