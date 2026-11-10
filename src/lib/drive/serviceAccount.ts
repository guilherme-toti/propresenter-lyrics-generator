import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getAppConfigDir } from "@/lib/desktop/appConfigDir";
import { DriveError } from "./driveError";
import { GOOGLE_TOKEN_URL, serviceAccountKeySchema, signedAssertion, type ServiceAccountKey } from "./serviceAccountJwt";

/** The service account's key, copied here from wherever it was downloaded. Kept out of the .env:
 * it's a whole JSON file, and only this server reads it. */
const KEY_FILENAME = "google-service-account.json";
const TOKEN_TIMEOUT_MS = 15_000;
/** A token is renewed this long before it expires, so a download never starts on one about to die. */
const TOKEN_MARGIN_MS = 60_000;

export const MISSING_SERVICE_ACCOUNT = "Falta a conta de serviço do Google. Escolha o arquivo dela em Ajustes.";

const tokenReplySchema = z.object({ access_token: z.string(), expires_in: z.number() });

interface CachedToken {
  email: string;
  token: string;
  expiresAt: number;
}

/** On globalThis because Next can load this module once per route bundle. */
function tokenCache(): { current: CachedToken | null } {
  const store = globalThis as typeof globalThis & { __pmaDriveToken?: { current: CachedToken | null } };
  store.__pmaDriveToken ??= { current: null };
  return store.__pmaDriveToken;
}

function keyPath(): string {
  return path.join(getAppConfigDir(), KEY_FILENAME);
}

function parseKey(content: string): ServiceAccountKey | null {
  try {
    const parsed = serviceAccountKeySchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function readKey(): Promise<ServiceAccountKey | null> {
  const content = await fs.readFile(keyPath(), "utf8").catch(() => null);
  return content === null ? null : parseKey(content);
}

/** The address a Drive folder has to be shared with, or null when no account is set up yet. */
export async function serviceAccountEmail(): Promise<string | null> {
  return (await readKey())?.client_email ?? null;
}

async function requestToken(key: ServiceAccountKey, signal: AbortSignal): Promise<CachedToken> {
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: signedAssertion(key, Math.floor(Date.now() / 1000)),
  });
  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.any([signal, AbortSignal.timeout(TOKEN_TIMEOUT_MS)]),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    console.error("Google token endpoint unreachable", err);
    throw new DriveError("Sem conexão com o Google. Confira a internet e tente de novo.", 502);
  }
  const reply = tokenReplySchema.safeParse(await res.json().catch(() => null));
  if (!res.ok || !reply.success) {
    console.error(`Google refused the service account (${res.status})`);
    throw new DriveError(
      "O Google recusou a conta de serviço. A chave pode ter sido apagada no Google Cloud: baixe uma nova e escolha ela em Ajustes.",
      502,
    );
  }
  return {
    email: key.client_email,
    token: reply.data.access_token,
    expiresAt: Date.now() + reply.data.expires_in * 1000,
  };
}

/** A token for calling Drive as the service account, reused until it's about to expire. */
export async function driveAccessToken(signal: AbortSignal): Promise<{ token: string; email: string }> {
  const key = await readKey();
  if (!key) throw new DriveError(MISSING_SERVICE_ACCOUNT, 400);

  const cache = tokenCache();
  const cached = cache.current;
  if (cached && cached.email === key.client_email && cached.expiresAt - TOKEN_MARGIN_MS > Date.now()) {
    return { token: cached.token, email: cached.email };
  }
  const fresh = await requestToken(key, signal);
  cache.current = fresh;
  return { token: fresh.token, email: fresh.email };
}

/**
 * Takes the key file the user picked: checks it's a service account key Google still accepts, then
 * keeps a copy only this computer's user can read. Answers the account's email.
 */
export async function saveServiceAccountFrom(filePath: string, signal: AbortSignal): Promise<string> {
  const content = await fs.readFile(filePath, "utf8").catch(() => null);
  const key = content === null ? null : parseKey(content);
  if (!key) {
    throw new DriveError(
      "Esse arquivo não é a chave de uma conta de serviço. No Google Cloud, abra a conta de serviço, vá em Chaves e crie uma chave JSON.",
      400,
    );
  }

  const token = await requestToken(key, signal);
  const dir = getAppConfigDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(keyPath(), `${JSON.stringify(key)}\n`, { encoding: "utf8", mode: 0o600 });
  // The mode above only applies to a new file; replacing a key keeps the old one's otherwise.
  await fs.chmod(keyPath(), 0o600).catch(() => undefined);
  tokenCache().current = token;
  return key.client_email;
}
