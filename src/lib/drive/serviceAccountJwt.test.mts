import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import {
  DRIVE_READONLY_SCOPE,
  GOOGLE_TOKEN_URL,
  serviceAccountKeySchema,
  signedAssertion,
} from "./serviceAccountJwt.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const KEY = { type: "service_account" as const, client_email: "pma-app@pma.iam.gserviceaccount.com", private_key: privateKey };

test("signs a read-only Drive request for the account, valid for an hour", () => {
  const jwt = signedAssertion(KEY, 1_800_000_000);
  const [header, claims, signature] = jwt.split(".");

  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url").toString()), {
    iss: "pma-app@pma.iam.gserviceaccount.com",
    scope: DRIVE_READONLY_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: 1_800_000_000,
    exp: 1_800_003_600,
  });
  const verifier = createVerify("RSA-SHA256").update(`${header}.${claims}`);
  assert.equal(verifier.verify(publicKey, Buffer.from(signature, "base64url")), true);
});

test("accepts the key file Google Cloud downloads, extra fields and all", () => {
  const parsed = serviceAccountKeySchema.safeParse({
    ...KEY,
    project_id: "pma",
    private_key_id: "abc",
    client_id: "123",
    token_uri: "https://evil.example/token",
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && "token_uri" in parsed.data, false);
});

test("refuses other Google credential files and anything without a private key", () => {
  assert.equal(serviceAccountKeySchema.safeParse({ ...KEY, type: "authorized_user" }).success, false);
  assert.equal(serviceAccountKeySchema.safeParse({ type: "service_account", client_email: KEY.client_email }).success, false);
  assert.equal(serviceAccountKeySchema.safeParse({ installed: { client_id: "x" } }).success, false);
});
