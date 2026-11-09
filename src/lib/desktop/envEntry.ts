import { z } from "zod";

// The .env file is one `KEY=value` per line, and the Rust shell hands every line to the
// server process at spawn: a line break inside a value would smuggle in a new variable
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
