import type { z } from "zod";

const GENERIC_ERROR = "Algo deu errado. Tente de novo.";
const UNEXPECTED_REPLY_ERROR =
  "O app recebeu uma resposta inesperada. Feche e abra o app de novo; se continuar, avise quem cuida do app.";

export interface JsonRequestOptions {
  signal?: AbortSignal;
}

async function readJsonObject(res: Response): Promise<Record<string, unknown>> {
  const parsed: unknown = await res.json();
  return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

/** Calls one of the app's own routes and answers its JSON reply. A failed request throws the
 * route's own `error` message, which is written to be shown to the user as-is. A dropped
 * connection or a reply that can't be read would otherwise put the browser's English ("Load
 * failed", "Unexpected end of JSON input") on screen, so those become a plain message and the
 * detail goes to the console. */
async function callRoute(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let routeError: unknown;
  try {
    const res = await fetch(url, init);
    const reply = await readJsonObject(res);
    if (res.ok) return reply;
    routeError = reply.error;
  } catch (err) {
    // A cancel the caller asked for isn't a failure to report; it checks for the AbortError itself.
    if (init.signal?.aborted) throw err;
    console.error(`${init.method ?? "GET"} ${url} failed`, err);
    throw new Error(GENERIC_ERROR);
  }
  throw new Error(typeof routeError === "string" ? routeError : GENERIC_ERROR);
}

export function postJson(url: string, body: unknown, options?: JsonRequestOptions): Promise<Record<string, unknown>> {
  // The routes only accept JSON bodies (see src/proxy.ts).
  return callRoute(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options?.signal,
  });
}

/** A reply in another shape than its schema (a renamed field, or an older server binary in the app
 * bundle) would otherwise break the screen or put an English TypeError on it, so it becomes a
 * plain message and the mismatch goes to the console. */
function parseReply<S extends z.ZodType>(request: string, data: unknown, schema: S): z.output<S> {
  const parsed = schema.safeParse(data);
  if (parsed.success) return parsed.data;
  console.error(`${request} answered in an unexpected shape`, parsed.error.issues);
  throw new Error(UNEXPECTED_REPLY_ERROR);
}

/** postJson for a route whose reply has a schema. */
export async function postJsonAs<S extends z.ZodType>(
  url: string,
  body: unknown,
  schema: S,
  options?: JsonRequestOptions,
): Promise<z.output<S>> {
  return parseReply(`POST ${url}`, await postJson(url, body, options), schema);
}

/** The same for a route read with GET. */
export async function getJsonAs<S extends z.ZodType>(url: string, schema: S): Promise<z.output<S>> {
  return parseReply(`GET ${url}`, await callRoute(url, { method: "GET" }), schema);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : GENERIC_ERROR;
}
