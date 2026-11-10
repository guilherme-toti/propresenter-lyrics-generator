import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { useBackgroundsDraft } from "./draftStore.ts";

const draft = () => useBackgroundsDraft.getState();

function trayFile(id: string) {
  return { id, fileName: `${id}.png`, mediaType: "image" as const, sourcePath: `/semana/${id}.png` };
}

beforeEach(() => {
  useBackgroundsDraft.setState({ tray: [], selectedTrayFileId: null, staged: {}, notices: {} });
  draft().addToTray([trayFile("x"), trayFile("z")]);
});

test("staging puts the file on that one screen, clearing its old notice and the selection", () => {
  draft().selectTrayFile("x");
  draft().setNotice("palavra", { tone: "error", message: "antes" });
  draft().setNotice("biblia", { tone: "sent" });
  draft().stage("palavra", "x");
  assert.deepEqual(draft().staged, { palavra: { trayFileId: "x" } });
  assert.equal(draft().selectedTrayFileId, null);
  assert.deepEqual(draft().notices, { biblia: { tone: "sent" } });
});

test("taking back one screen's change leaves the others staged", () => {
  draft().stage("palavra", "x");
  draft().stage("biblia", "x");
  draft().unstage("biblia");
  assert.deepEqual(draft().staged, { palavra: { trayFileId: "x" } });
});

test("a change restaged while the old one was going out stays staged", () => {
  draft().stage("inicio", "x");
  // The user drops another file on the screen while "x" is still being copied.
  draft().stage("inicio", "z");
  draft().markSent("inicio", "x");
  assert.deepEqual(draft().staged, { inicio: { trayFileId: "z" } });
  assert.deepEqual(draft().notices, { inicio: { tone: "sent" } });
});

test("a sent change leaves the draft", () => {
  draft().stage("inicio", "x");
  draft().stage("fim", "x");
  draft().markSent("inicio", "x");
  assert.deepEqual(draft().staged, { fim: { trayFileId: "x" } });
});

test("removing a tray file takes back every change that used it, and its selection", () => {
  draft().stage("palavra", "x");
  draft().stage("biblia", "x");
  draft().stage("fim", "z");
  draft().selectTrayFile("x");
  draft().removeFromTray("x");
  assert.deepEqual(draft().tray.map((file) => file.id), ["z"]);
  assert.deepEqual(Object.keys(draft().staged), ["fim"]);
  assert.equal(draft().selectedTrayFileId, null);
});

test("a file added again keeps its first tray item, even within one batch", () => {
  draft().addToTray([{ ...trayFile("x2"), sourcePath: "/semana/x.png" }, trayFile("n"), { ...trayFile("n2"), sourcePath: "/semana/n.png" }]);
  assert.deepEqual(draft().tray.map((file) => file.id), ["x", "z", "n"]);
});
