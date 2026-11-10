import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { getJsonAs, postForFile, postJsonAs } from "./postJson.ts";
import { maskedApiKeyReplySchema } from "./desktop/envEntry.ts";
import { slotChangeReplySchema } from "./propresenter/backgrounds/contracts.ts";
import { answerWith, silenceConsoleError, UNEXPECTED_REPLY } from "./testing/fetchMock.mts";

const slot = {
  id: "a1b2c3d4e5f60718",
  fileName: "Fundo Palavra.mp4",
  mediaType: "video",
  exists: true,
  mtimeMs: 1731100000000,
  canUndo: false,
  canRedo: true,
};

afterEach(() => mock.restoreAll());

test("returns the reply when it has the shape the route promises", async () => {
  answerWith(200, { slot });
  assert.deepEqual(await postJsonAs("/api/backgrounds/undo", {}, slotChangeReplySchema), { slot });
});

test("turns a reply in another shape into a plain message and logs what didn't match", async () => {
  answerWith(200, { slot: { ...slot, canRedo: undefined } });
  const logged = silenceConsoleError();

  await assert.rejects(postJsonAs("/api/backgrounds/undo", {}, slotChangeReplySchema), { message: UNEXPECTED_REPLY });
  assert.equal(logged.mock.callCount(), 1);
});

test("keeps the route's own message when the request fails", async () => {
  const message = "Esse arquivo não está mais nas macros. Clique em “Atualizar” e tente de novo.";
  answerWith(404, { error: message });
  await assert.rejects(postJsonAs("/api/backgrounds/undo", {}, slotChangeReplySchema), { message });
});

test("says something plain instead of the browser's English when the connection drops", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Load failed");
  });
  silenceConsoleError();

  await assert.rejects(postJsonAs("/api/backgrounds/undo", {}, slotChangeReplySchema), {
    message: "Algo deu errado. Tente de novo.",
  });
});

test("lets a cancel through as the AbortError its caller checks for", async () => {
  mock.method(globalThis, "fetch", async (_input: string, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    return Response.json({ slot });
  });
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    postJsonAs("/api/backgrounds/undo", {}, slotChangeReplySchema, { signal: controller.signal }),
    (err: unknown) => err instanceof DOMException && err.name === "AbortError",
  );
});

test("reads a GET reply against its schema too", async () => {
  answerWith(200, { masked: "sk-or-…a1b2" });
  assert.deepEqual(await getJsonAs("/api/settings/api-key", maskedApiKeyReplySchema), { masked: "sk-or-…a1b2" });

  answerWith(200, { key: "sk-or-…a1b2" });
  silenceConsoleError();
  await assert.rejects(getJsonAs("/api/settings/api-key", maskedApiKeyReplySchema), { message: UNEXPECTED_REPLY });
});

test("hands back a downloaded file with the name the route suggests", async () => {
  const bytes = new Uint8Array([0x0a, 0x10, 0x20]);
  const fetchMock = mock.method(globalThis, "fetch", async () =>
    new Response(bytes, {
      headers: { "Content-Disposition": `attachment; filename="${encodeURIComponent("Grande é o Senhor.pro")}"` },
    }),
  );

  const { blob, fileName } = await postForFile("/api/export/propresenter", { song: { title: "Grande é o Senhor" } });

  assert.equal(fileName, "Grande é o Senhor.pro");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  const init = fetchMock.mock.calls[0].arguments[1];
  assert.equal(init?.method, "POST");
  assert.deepEqual(init?.headers, { "Content-Type": "application/json" });
});

test("says something plain when the connection drops during a download", async () => {
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
  silenceConsoleError();

  await assert.rejects(postForFile("/api/export/propresenter", { song: {} }), {
    message: "Algo deu errado. Tente de novo.",
  });
});

test("keeps the route's own message when a download fails", async () => {
  const message = "Falha ao gerar o arquivo do ProPresenter.";
  answerWith(500, { error: message });
  await assert.rejects(postForFile("/api/export/propresenter", { song: {} }), { message });
});
