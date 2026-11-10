import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { useBackgroundsDraft } from "./draftStore.ts";

const draft = () => useBackgroundsDraft.getState();

function trayFile(id: string) {
  return { id, fileName: `${id}.png`, mediaType: "image" as const, sourcePath: `/semana/${id}.png` };
}

beforeEach(() => {
  useBackgroundsDraft.setState({ tray: [], selectedTrayFileId: null, staged: {}, notices: {}, sentTogether: {}, undoneTogether: {} });
  draft().addToTray([trayFile("x"), trayFile("z")]);
});

test("staging on a slot stages its copies too, as followers", () => {
  draft().selectTrayFile("x");
  draft().setNotice("palavra", { tone: "error", message: "antes" });
  draft().stage(["palavra", "biblia"], "x");
  assert.deepEqual(draft().staged, {
    palavra: { trayFileId: "x", followsSlotId: null },
    biblia: { trayFileId: "x", followsSlotId: "palavra" },
  });
  assert.equal(draft().selectedTrayFileId, null);
  assert.deepEqual(draft().notices, {});
});

test("taking back the dropped-on slot takes back its copies; taking back a copy keeps the slot", () => {
  draft().stage(["palavra", "biblia"], "x");
  draft().unstage("biblia");
  assert.deepEqual(Object.keys(draft().staged), ["palavra"]);

  draft().stage(["palavra", "biblia"], "x");
  draft().unstage("palavra");
  assert.deepEqual(draft().staged, {});
});

test("restaging a slot without its old copies drops the copies it had pulled along", () => {
  draft().stage(["palavra", "biblia"], "x");
  draft().stage(["palavra"], "z");
  assert.deepEqual(draft().staged, { palavra: { trayFileId: "z", followsSlotId: null } });
});

test("a copy that failed to send stands alone afterwards, so its slot's next change can't take it back", () => {
  draft().stage(["palavra", "biblia"], "x");
  draft().markSent("palavra", "x");
  assert.deepEqual(draft().staged, { biblia: { trayFileId: "x", followsSlotId: null } });
  assert.deepEqual(draft().notices, { palavra: { tone: "sent" } });

  draft().stage(["palavra"], "z");
  draft().unstage("palavra");
  assert.deepEqual(draft().staged, { biblia: { trayFileId: "x", followsSlotId: null } });
});

test("a change restaged while the old one was going out stays staged", () => {
  draft().stage(["inicio"], "x");
  // The user drops another file on the screen while "x" is still being copied.
  draft().stage(["inicio"], "z");
  draft().markSent("inicio", "x");
  assert.deepEqual(draft().staged, { inicio: { trayFileId: "z", followsSlotId: null } });
});

test("removing a tray file takes back every change that used it, and its selection", () => {
  draft().stage(["palavra", "biblia"], "x");
  draft().stage(["fim"], "z");
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

test("an old send landing after a newer file was staged keeps the copy tied to the slot", () => {
  draft().stage(["palavra", "biblia"], "x");
  draft().stage(["palavra", "biblia"], "z");
  draft().markSent("palavra", "x");
  assert.deepEqual(draft().staged, {
    palavra: { trayFileId: "z", followsSlotId: null },
    biblia: { trayFileId: "z", followsSlotId: "palavra" },
  });
  draft().unstage("palavra");
  assert.deepEqual(draft().staged, {});
});

test("remembers which slots were undone together, until one of them is sent again", () => {
  draft().rememberUndoneTogether(["palavra", "biblia"]);
  assert.deepEqual(draft().undoneTogether, { palavra: ["palavra", "biblia"], biblia: ["palavra", "biblia"] });

  draft().stage(["palavra"], "x");
  draft().markSent("palavra", "x");
  assert.deepEqual(draft().undoneTogether, { biblia: ["palavra", "biblia"] });
});

test("a slot sent again on its own leaves its old send group", () => {
  draft().rememberSentTogether(["palavra", "biblia"]);
  assert.deepEqual(draft().sentTogether, { palavra: ["palavra", "biblia"], biblia: ["palavra", "biblia"] });

  draft().rememberSentTogether(["palavra"]);
  assert.deepEqual(draft().sentTogether, { biblia: ["biblia"], palavra: ["palavra"] });
});
