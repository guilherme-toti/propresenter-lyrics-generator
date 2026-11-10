import { mock } from "node:test";

/** What postJsonAs and getJsonAs show when a reply doesn't match its schema. Spelled out rather
 * than imported, so a test also catches the copy changing by accident. */
export const UNEXPECTED_REPLY =
  "O app recebeu uma resposta inesperada. Feche e abra o app de novo; se continuar, avise quem cuida do app.";

/** Every fetch answers `body` as JSON with `status`, the way one of the app's routes would. Undone
 * by `mock.restoreAll()`. */
export function answerWith(status: number, body: unknown) {
  mock.method(globalThis, "fetch", async () => Response.json(body, { status }));
}

/** Keeps the test output clean of the console.error a mismatch logs, and lets a test count it. */
export function silenceConsoleError() {
  return mock.method(console, "error", () => {});
}
