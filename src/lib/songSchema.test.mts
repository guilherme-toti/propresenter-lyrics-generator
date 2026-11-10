import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { postJsonAs } from "./postJson.ts";
import {
  generatedSongReplySchema,
  importableFilesReplySchema,
  importedSongReplySchema,
  realignedLyricsReplySchema,
  recordingLyricsReplySchema,
  trackSearchReplySchema,
} from "./songSchema.ts";
import { answerWith, silenceConsoleError, UNEXPECTED_REPLY } from "./testing/fetchMock.mts";
import { createEmptySong } from "./types.ts";

afterEach(() => mock.restoreAll());

/** The reply as it crosses the wire, where undefined fields drop out. */
function overTheWire<T>(reply: T): unknown {
  return JSON.parse(JSON.stringify(reply));
}

test("reads the song /api/songs/import builds, even from a .pro file with no text", () => {
  const song = createEmptySong({ title: "É Ele", mode: "manual", languageA: "", languageB: "", alignment: [] });
  const parsed = importedSongReplySchema.safeParse(overTheWire({ song }));
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, { song });
});

test("reads a library listing and rejects one whose file has no path", () => {
  const file = { library: "Louvor", filename: "É Ele (2).pro", name: "É Ele (2)", path: "/Libraries/Louvor/É Ele (2).pro" };
  assert.deepEqual(importableFilesReplySchema.parse({ files: [file] }), { files: [file] });

  assert.equal(importableFilesReplySchema.safeParse({ files: [{ ...file, path: undefined }] }).success, false);
});

const alignment = [
  { id: "l1", a: "Abre caminho", b: "Way maker", sectionBreakBefore: true, sectionLabel: "Verso 1" },
  { id: "l2", a: "Opera milagres", b: "Miracle worker", sectionBreakBefore: false },
];

test("reads the song /api/generate-song builds", async () => {
  const song = createEmptySong({
    title: "Way Maker",
    artist: "Sinach",
    mode: "ai",
    languageA: "Abre caminho\nOpera milagres",
    languageB: "Way maker\nMiracle worker",
    alignment,
    sourceB: { commontrackId: 42, title: "Way Maker", artist: "Sinach" },
    attributionB: { copyright: "Letra © Sinach", trackingUrl: "https://tracking.example/pixel" },
    translatableSide: "languageA",
  });
  // The server's source also carries its attribution; the song keeps that once, in attributionB.
  answerWith(200, { song: { ...song, sourceB: { ...song.sourceB, attribution: song.attributionB } } });

  assert.deepEqual(await postJsonAs("/api/generate-song", {}, generatedSongReplySchema), { song });
});

test("turns a generated song in another shape into a plain message", async () => {
  const song = createEmptySong({ mode: "ai", alignment });
  answerWith(200, { song: { ...song, alignment: alignment.map((line) => ({ ...line, id: undefined })) } });
  const logged = silenceConsoleError();

  await assert.rejects(postJsonAs("/api/generate-song", {}, generatedSongReplySchema), { message: UNEXPECTED_REPLY });
  assert.equal(logged.mock.callCount(), 1);
});

test("reads what /api/realign-song and /api/translate-literally answer", async () => {
  const reply = { languageARaw: "Abre caminho\nOpera milagres", languageBRaw: "Way maker\nMiracle worker", alignment };
  answerWith(200, reply);
  assert.deepEqual(await postJsonAs("/api/realign-song", {}, realignedLyricsReplySchema), reply);
});

test("turns a realignment in another shape into a plain message", async () => {
  answerWith(200, { sections: [{ label: "Verso 1", lines: [] }] });
  silenceConsoleError();
  await assert.rejects(postJsonAs("/api/realign-song", {}, realignedLyricsReplySchema), { message: UNEXPECTED_REPLY });
});

test("reads catalogue matches and refuses one whose id isn't a number", async () => {
  const track = { commontrackId: 42, title: "Way Maker", artist: "Sinach", language: "en", trackRating: 87 };
  answerWith(200, { results: [track] });
  assert.deepEqual(await postJsonAs("/api/songs/search", {}, trackSearchReplySchema), { results: [track] });

  answerWith(200, { results: [{ ...track, commontrackId: "42" }] });
  silenceConsoleError();
  await assert.rejects(postJsonAs("/api/songs/search", {}, trackSearchReplySchema), { message: UNEXPECTED_REPLY });
});

test("reads a recording's lyrics and refuses them without the tracking link Musixmatch requires", async () => {
  const lyrics = { text: "Way maker", copyright: "Letra © Sinach", trackingUrl: "https://tracking.example/pixel" };
  answerWith(200, lyrics);
  assert.deepEqual(await postJsonAs("/api/songs/lyrics", {}, recordingLyricsReplySchema), lyrics);

  answerWith(200, { text: lyrics.text, copyright: lyrics.copyright });
  silenceConsoleError();
  await assert.rejects(postJsonAs("/api/songs/lyrics", {}, recordingLyricsReplySchema), { message: UNEXPECTED_REPLY });
});
