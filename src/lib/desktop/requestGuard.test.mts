import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrustedDesktopRequest } from "./requestGuard.ts";

const jsonPost = (overrides: Record<string, string | null> = {}) => {
  const headers = new Headers({
    host: "127.0.0.1:17872",
    origin: "http://127.0.0.1:17872",
    "content-type": "application/json",
    "content-length": "14",
  });
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }
  return headers;
};

test("trusts the packaged app's own JSON request", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost()), true);
});

test("trusts the dev webview and a dev browser tab on their own hosts", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" })), true);
  assert.equal(isTrustedDesktopRequest(jsonPost({ host: "localhost:3100", origin: "http://localhost:3100" })), true);
});

test("accepts a JSON content type with parameters", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ "content-type": "Application/JSON; charset=utf-8" })), true);
});

test("trusts local tools that send no Origin", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ origin: null })), true);
});

test("trusts a body-less GET with no Origin and no content type", () => {
  assert.equal(isTrustedDesktopRequest(new Headers({ host: "127.0.0.1:17872" })), true);
});

test("trusts a body-less request regardless of content type", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ "content-type": null, "content-length": "0" })), true);
});

test("refuses another website's request", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ origin: "https://evil.example" })), false);
});

test("refuses another local port, which is a different origin", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ origin: "http://127.0.0.1:3000" })), false);
});

test("refuses localhost and 127.0.0.1 standing in for each other", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ origin: "http://localhost:17872" })), false);
});

test('refuses the opaque "null" origin', () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ origin: "null" })), false);
});

test("refuses an Origin when there is no Host to compare it with", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ host: null })), false);
});

test("refuses a same-origin text/plain body, the preflight-free simple request", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ "content-type": "text/plain;charset=UTF-8" })), false);
});

test("refuses form encodings, which a cross-site <form> can send", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ "content-type": "application/x-www-form-urlencoded" })), false);
  assert.equal(isTrustedDesktopRequest(jsonPost({ "content-type": "multipart/form-data; boundary=x" })), false);
});

test("refuses a body with no content type", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ origin: null, "content-type": null })), false);
});

test("treats a chunked body as a body", () => {
  const headers = jsonPost({ origin: null, "content-length": null, "content-type": "text/plain" });
  headers.set("transfer-encoding", "chunked");
  assert.equal(isTrustedDesktopRequest(headers), false);
});

test("refuses a DNS-rebound page whose Origin and Host both name its own domain", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ host: "evil.example:17872", origin: "http://evil.example:17872" })), false);
});

test("refuses a same-origin request on a non-loopback host, such as a LAN address", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ host: "192.168.0.20:3100", origin: "http://192.168.0.20:3100" })), false);
  assert.equal(isTrustedDesktopRequest(jsonPost({ host: "evil.example:17872", origin: null })), false);
});

test("trusts the IPv6 loopback host", () => {
  assert.equal(isTrustedDesktopRequest(jsonPost({ host: "[::1]:17872", origin: "http://[::1]:17872" })), true);
});
