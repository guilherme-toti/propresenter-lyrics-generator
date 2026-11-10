import { test } from "node:test";
import assert from "node:assert/strict";
import type { MacroMedia } from "../propresenter/backgrounds/slots.ts";
import { activeLinks, changeGroup, followersOf, historyGroup, otherMacrosChanged } from "./links.ts";

function macro(name: string, backgrounds: string[], props: string[]): MacroMedia {
  return { macroUuid: `uuid-${name}`, macroName: name, macroColor: null, backgrounds, props };
}

/** The church's service: Início and Fim share a prop, Palavra and Palavra Bíblia share another,
 * and the user linked Palavra Bíblia's background to Palavra's (ProPresenter darkens it). */
const macros = [
  macro("Início", ["bg-inicio"], ["prop-logo"]),
  macro("Ofertório", ["bg-oferta"], []),
  macro("Palavra", ["bg-palavra"], ["prop-verso"]),
  macro("Palavra Bíblia", ["bg-biblia"], ["prop-verso"]),
  macro("Fim", ["bg-fim"], ["prop-logo"]),
];
const links = { "bg-biblia": "bg-palavra" };

test("a dropped file reaches the screen and its followers, never its leader", () => {
  assert.deepEqual(changeGroup("bg-palavra", links), ["bg-palavra", "bg-biblia"]);
  assert.deepEqual(changeGroup("bg-biblia", links), ["bg-biblia"]);
  assert.deepEqual(followersOf("bg-inicio", links), []);
});

test("names the macros a change also reaches, through a shared file or a follower", () => {
  assert.deepEqual(otherMacrosChanged("uuid-Início", "prop-logo", macros, links), ["Fim"]);
  assert.deepEqual(otherMacrosChanged("uuid-Palavra", "bg-palavra", macros, links), ["Palavra Bíblia"]);
  assert.deepEqual(otherMacrosChanged("uuid-Palavra Bíblia", "bg-biblia", macros, links), []);
  assert.deepEqual(otherMacrosChanged("uuid-Palavra Bíblia", "prop-verso", macros, links), ["Palavra"]);
});

function slot(id: string, canUndo: boolean, canRedo: boolean) {
  return { id, fileName: `${id}.png`, mediaType: "image" as const, exists: true, mtimeMs: 1, canUndo, canRedo };
}

test("undo takes back what was sent together, not every identical file", () => {
  const slots = [slot("bg-palavra", true, false), slot("bg-biblia", true, false), slot("bg-inicio", true, false)];
  const sent = { "bg-palavra": ["bg-palavra", "bg-biblia"], "bg-biblia": ["bg-palavra", "bg-biblia"] };
  assert.deepEqual(historyGroup("bg-biblia", "undoing", slots, { sent, undone: {} }), ["bg-biblia", "bg-palavra"]);
  // Identical to the others by coincidence, but sent on its own: undone on its own.
  assert.deepEqual(historyGroup("bg-inicio", "undoing", slots, { sent, undone: {} }), ["bg-inicio"]);

  const palavraHasNoBackup = [slot("bg-palavra", false, false), slot("bg-biblia", true, false)];
  assert.deepEqual(historyGroup("bg-biblia", "undoing", palavraHasNoBackup, { sent, undone: {} }), ["bg-biblia"]);
});

test("redo takes the slots undone together", () => {
  const slots = [slot("bg-palavra", false, true), slot("bg-biblia", false, true)];
  const undone = { "bg-palavra": ["bg-palavra", "bg-biblia"], "bg-biblia": ["bg-palavra", "bg-biblia"] };
  assert.deepEqual(historyGroup("bg-palavra", "redoing", slots, { sent: {}, undone }), ["bg-palavra", "bg-biblia"]);
  assert.deepEqual(historyGroup("bg-palavra", "redoing", slots, { sent: {}, undone: {} }), ["bg-palavra"]);
});

test("ignores links to screens no longer shown, and chains past one step", () => {
  const slots = ["bg-palavra", "bg-biblia", "bg-fim"].map((id) => slot(id, false, false));
  assert.deepEqual(activeLinks({ "bg-biblia": "bg-palavra", "bg-gone": "bg-palavra", "bg-fim": "bg-gone" }, slots), {
    "bg-biblia": "bg-palavra",
  });
  // Fim follows Bíblia, which follows Palavra: Fim's link would spread a change two steps.
  assert.deepEqual(activeLinks({ "bg-biblia": "bg-palavra", "bg-fim": "bg-biblia" }, slots), { "bg-biblia": "bg-palavra" });
});
