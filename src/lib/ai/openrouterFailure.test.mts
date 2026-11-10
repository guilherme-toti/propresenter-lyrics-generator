import { test } from "node:test";
import assert from "node:assert/strict";
import { FAILURE_MESSAGES, failureForStatus } from "./openrouterFailure.ts";

// Spelled out rather than imported, so the test also catches the copy changing by accident.
const KEY_REJECTED =
  "A OpenRouter recusou a chave salva em Ajustes. Confira a chave em Ajustes → Chave da OpenRouter.";
const NO_CREDITS = "Acabaram os créditos da OpenRouter. Adicione créditos na conta e tente de novo.";
const RATE_LIMITED = "A OpenRouter está recebendo pedidos demais agora. Espere um pouco e tente de novo.";
const UNAVAILABLE = "A OpenRouter não respondeu como esperado. Tente de novo em instantes.";

function messageFor(status: number): string {
  return FAILURE_MESSAGES[failureForStatus(status)];
}

test("a refused key sends the person to the key in Ajustes", () => {
  assert.equal(messageFor(401), KEY_REJECTED);
  assert.equal(messageFor(403), KEY_REJECTED);
});

test("running out of credit says to add credit", () => {
  assert.equal(messageFor(402), NO_CREDITS);
});

test("a rate limit says to wait and try again", () => {
  assert.equal(messageFor(429), RATE_LIMITED);
});

test("any other status says OpenRouter didn't answer as expected", () => {
  for (const status of [400, 404, 408, 413, 500, 502, 503, 504]) {
    assert.equal(messageFor(status), UNAVAILABLE, `status ${status}`);
  }
});

test("an empty reply has its own plain message", () => {
  assert.equal(FAILURE_MESSAGES.unavailable, UNAVAILABLE);
});

test("no message shows a status code or OpenRouter's own reply", () => {
  for (const message of Object.values(FAILURE_MESSAGES)) {
    assert.doesNotMatch(message, /\d{3}|\{|requisição/i);
  }
});
