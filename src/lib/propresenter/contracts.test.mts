import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { postJsonAs } from "../postJson.ts";
import { answerWith, silenceConsoleError, UNEXPECTED_REPLY } from "../testing/fetchMock.mts";
import {
  addToPlaylistReplySchema,
  exportConflictReplySchema,
  exportSavedReplySchema,
  pingReplySchema,
  playlistsReplySchema,
} from "./contracts.ts";

afterEach(() => mock.restoreAll());

const UNREACHABLE =
  "O ProPresenter não respondeu. Confira se ele está aberto, com a rede ativada, e se a porta em Ajustes é a mesma das preferências de rede dele.";

test("keeps the reason a playlist list came back empty, so a closed ProPresenter isn't read as no playlists", async () => {
  const playlists = [{ id: "9F1C", name: "Culto de Domingo" }];
  answerWith(200, { playlists });
  assert.deepEqual(await postJsonAs("/api/playlists/list", {}, playlistsReplySchema), { playlists });

  answerWith(200, { playlists: [], error: UNREACHABLE });
  assert.deepEqual(await postJsonAs("/api/playlists/list", {}, playlistsReplySchema), {
    playlists: [],
    error: UNREACHABLE,
  });
});

test("turns a playlist list in another shape into a plain message", async () => {
  answerWith(200, { playlists: [{ uuid: "9F1C", name: "Culto de Domingo" }] });
  silenceConsoleError();
  await assert.rejects(postJsonAs("/api/playlists/list", {}, playlistsReplySchema), { message: UNEXPECTED_REPLY });
});

test("reads both answers of a connection test, and refuses a success that doesn't say where it connected", async () => {
  const connected = { ok: true, name: "ProPresenter", hostDescription: "Mac do Louvor" };
  answerWith(200, connected);
  assert.deepEqual(await postJsonAs("/api/propresenter/ping", {}, pingReplySchema), connected);

  answerWith(200, { ok: false, error: UNREACHABLE });
  assert.deepEqual(await postJsonAs("/api/propresenter/ping", {}, pingReplySchema), { ok: false, error: UNREACHABLE });

  answerWith(200, { ok: true });
  silenceConsoleError();
  await assert.rejects(postJsonAs("/api/propresenter/ping", {}, pingReplySchema), { message: UNEXPECTED_REPLY });
});

test("reads a playlist add that worked or didn't, and refuses a failure without its reason", async () => {
  answerWith(200, { added: true });
  assert.deepEqual(await postJsonAs("/api/playlists/add-item", {}, addToPlaylistReplySchema), { added: true });

  const reason = "O ProPresenter ainda não indexou a apresentação na biblioteca.";
  answerWith(200, { added: false, reason });
  assert.deepEqual(await postJsonAs("/api/playlists/add-item", {}, addToPlaylistReplySchema), { added: false, reason });

  answerWith(200, { added: false });
  silenceConsoleError();
  await assert.rejects(postJsonAs("/api/playlists/add-item", {}, addToPlaylistReplySchema), {
    message: UNEXPECTED_REPLY,
  });
});

test("reads a conflict check that found a file or none", async () => {
  const conflict = { library: "Louvor", path: "/Libraries/Louvor/É Ele.pro" };
  answerWith(200, { conflict });
  assert.deepEqual(await postJsonAs("/api/export/check-conflict", {}, exportConflictReplySchema), { conflict });

  answerWith(200, { conflict: null });
  assert.deepEqual(await postJsonAs("/api/export/check-conflict", {}, exportConflictReplySchema), { conflict: null });

  answerWith(200, { conflict: { library: "Louvor" } });
  silenceConsoleError();
  await assert.rejects(postJsonAs("/api/export/check-conflict", {}, exportConflictReplySchema), {
    message: UNEXPECTED_REPLY,
  });
});

test("reads where an export was saved, and refuses a reply without the path", async () => {
  answerWith(200, { savedTo: "/Libraries/Louvor/É Ele (2).pro" });
  assert.deepEqual(await postJsonAs("/api/export/propresenter", {}, exportSavedReplySchema), {
    savedTo: "/Libraries/Louvor/É Ele (2).pro",
  });

  answerWith(200, {});
  silenceConsoleError();
  await assert.rejects(postJsonAs("/api/export/propresenter", {}, exportSavedReplySchema), { message: UNEXPECTED_REPLY });
});
