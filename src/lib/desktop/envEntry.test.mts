import { test } from "node:test";
import assert from "node:assert/strict";
import { apiKeyRequestSchema, assertSafeEnvEntry } from "./envEntry.ts";

const firstIssue = (input: unknown) => {
  const parsed = apiKeyRequestSchema.safeParse(input);
  assert.equal(parsed.success, false);
  return parsed.error?.issues[0]?.message;
};

test("accepts a pasted key and trims the whitespace around it", () => {
  const parsed = apiKeyRequestSchema.safeParse({ apiKey: "  sk-or-v1-abc123\n" });
  assert.deepEqual(parsed.success && parsed.data, { apiKey: "sk-or-v1-abc123" });
});

test("refuses a key that smuggles in another .env line", () => {
  assert.equal(firstIssue({ apiKey: "x\nNODE_OPTIONS=--require /tmp/evil.js" }), "Cole a chave em uma linha só.");
  assert.equal(firstIssue({ apiKey: "x\rNODE_OPTIONS=--require /tmp/evil.js" }), "Cole a chave em uma linha só.");
});

test("refuses an empty or whitespace-only key", () => {
  assert.equal(firstIssue({ apiKey: "" }), "Cole uma chave válida.");
  assert.equal(firstIssue({ apiKey: " \n " }), "Cole uma chave válida.");
});

test("refuses a body without a string key", () => {
  assert.equal(apiKeyRequestSchema.safeParse({}).success, false);
  assert.equal(apiKeyRequestSchema.safeParse({ apiKey: 42 }).success, false);
  assert.equal(apiKeyRequestSchema.safeParse(null).success, false);
});

test("lets a normal entry through", () => {
  assert.doesNotThrow(() => assertSafeEnvEntry("OPENROUTER_API_KEY", "sk-or-v1-abc123"));
});

test("refuses line breaks in a value without echoing the secret", () => {
  for (const value of ["secret\nNODE_OPTIONS=x", "secret\rNODE_OPTIONS=x"]) {
    assert.throws(
      () => assertSafeEnvEntry("OPENROUTER_API_KEY", value),
      (error: unknown) => error instanceof Error && !error.message.includes("secret"),
    );
  }
});

test("refuses a key name with a line break or an equals sign", () => {
  assert.throws(() => assertSafeEnvEntry("A\nB", "v"));
  assert.throws(() => assertSafeEnvEntry("A\rB", "v"));
  assert.throws(() => assertSafeEnvEntry("A=B", "v"));
});
