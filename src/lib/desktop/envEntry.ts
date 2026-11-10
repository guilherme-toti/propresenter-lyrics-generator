import { z } from "zod";

/** The only entries the user's .env may hold. The Rust shell hands the file to the server
 * process's environment at spawn, so any other name (NODE_OPTIONS, PORT, PMA_DESKTOP_APP) would
 * let whoever can write that file change how the server runs. Keep in sync with USER_ENV_KEYS in
 * src-tauri/src/lib.rs. */
export const USER_ENV_KEYS = {
  openRouter: "OPENROUTER_API_KEY",
  musixmatch: "MUSIXMATCH_API_KEY",
} as const;

export type UserEnvKey = (typeof USER_ENV_KEYS)[keyof typeof USER_ENV_KEYS];

const ALLOWED_KEYS: ReadonlySet<string> = new Set(Object.values(USER_ENV_KEYS));

function isUserEnvKey(key: string): key is UserEnvKey {
  return ALLOWED_KEYS.has(key);
}

/** Reads the file's `KEY=value` lines and drops every key not listed above. */
export function parseUserEnv(content: string): Map<UserEnvKey, string> {
  const entries = new Map<UserEnvKey, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (isUserEnvKey(key)) entries.set(key, trimmed.slice(eq + 1).trim());
  }
  return entries;
}

// The .env file is one `KEY=value` per line, and the Rust shell hands every line to the server
// process at spawn: a line break inside a value would smuggle in a new variable
// (e.g. NODE_OPTIONS), and an "=" inside a key would split it somewhere else on read.
const LINE_BREAK = /[\r\n]/;

export const apiKeyRequestSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1, "Cole uma chave válida.")
    .refine((value) => !LINE_BREAK.test(value), "Cole a chave em uma linha só."),
});

export type ApiKeyRequest = z.infer<typeof apiKeyRequestSchema>;

/** What /api/settings/*-api-key answer to a read or a save: the key masked, never in full, or null
 * when none is saved. */
export const maskedApiKeyReplySchema = z.object({ masked: z.string().nullable() });

/** Last line of defense behind the request schemas: whatever reaches the file must stay on
 * its own line. The error names the key only, since the value is a secret. */
export function assertSafeEnvEntry(key: string, value: string): void {
  if (LINE_BREAK.test(key) || key.includes("=")) {
    throw new Error(`Refusing to write an unsafe .env key: ${JSON.stringify(key)}`);
  }
  if (LINE_BREAK.test(value)) {
    throw new Error(`Refusing to write a line break into the .env value of ${key}`);
  }
}
