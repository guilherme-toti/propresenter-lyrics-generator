import { test } from "node:test";
import assert from "node:assert/strict";
import { addTrayFilesReplySchema, backgroundsOverviewSchema, slotChangeReplySchema } from "./contracts.ts";

const palavraSlot = {
  id: "a1b2c3d4e5f60718",
  fileName: "Fundo Palavra.mp4",
  mediaType: "video",
  exists: true,
  mtimeMs: 1731100000000,
  canUndo: true,
  canRedo: false,
};

const logoSlot = {
  id: "0f1e2d3c4b5a6978",
  fileName: "Logo.png",
  mediaType: "image",
  exists: false,
  mtimeMs: null,
  canUndo: false,
  canRedo: true,
};

/** What /api/backgrounds/list sends for a two-macro service that shares a prop. */
const overview = {
  slots: [palavraSlot, logoSlot],
  macros: [
    {
      macroUuid: "6F3A2B1C-0D4E-4F5A-8B6C-7D8E9F0A1B2C",
      macroName: "Palavra",
      macroColor: "rgb(255 128 0)",
      backgrounds: [palavraSlot.id],
      props: [logoSlot.id],
    },
    {
      macroUuid: "1B2C3D4E-5F6A-4B7C-8D9E-0F1A2B3C4D5E",
      macroName: "Fim",
      macroColor: null,
      backgrounds: [],
      props: [logoSlot.id],
    },
  ],
};

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): PropertyKey[][] {
  return (result.error?.issues ?? []).map((issue) => issue.path);
}

test("reads the overview the list route sends, unchanged", () => {
  const parsed = backgroundsOverviewSchema.safeParse(overview);
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.data, overview);
});

test("rejects an overview from a server that predates Refazer", () => {
  const olderSlot = { ...palavraSlot, canRedo: undefined };
  const parsed = backgroundsOverviewSchema.safeParse({ ...overview, slots: [olderSlot, logoSlot] });
  assert.equal(parsed.success, false);
  assert.deepEqual(issuePaths(parsed), [["slots", 0, "canRedo"]]);
});

test("rejects a slot the screen can't show and a macro without its prop list", () => {
  const macroWithoutProps = { ...overview.macros[1], props: undefined };
  const parsed = backgroundsOverviewSchema.safeParse({
    ...overview,
    slots: [{ ...palavraSlot, mediaType: "audio" }, logoSlot],
    macros: [overview.macros[0], macroWithoutProps],
  });
  assert.equal(parsed.success, false);
  assert.deepEqual(issuePaths(parsed), [
    ["slots", 0, "mediaType"],
    ["macros", 1, "props"],
  ]);
});

test("rejects a reply that isn't an overview at all", () => {
  assert.equal(backgroundsOverviewSchema.safeParse({ ok: false, error: "Algo deu errado." }).success, false);
});

test("reads the slot replace, undo and redo send back, and rejects a reply without it", () => {
  assert.deepEqual(slotChangeReplySchema.parse({ slot: logoSlot }), { slot: logoSlot });
  assert.equal(slotChangeReplySchema.safeParse({ ok: true }).success, false);
});

test("reads the tray's files and refusals, and rejects a refusal without its message", () => {
  const reply = {
    files: [{ id: "8c1f4a2e-3b5d-4e6f-9a0b-1c2d3e4f5a6b", fileName: "Culto.png", mediaType: "image", sourcePath: "/Users/pma/Culto.png" }],
    refused: [{ fileName: "Fotos", message: "É uma pasta. Abra a pasta e solte os arquivos que estão nela." }],
  };
  assert.deepEqual(addTrayFilesReplySchema.parse(reply), reply);
  assert.equal(addTrayFilesReplySchema.safeParse({ ...reply, refused: [{ fileName: "Fotos" }] }).success, false);
});
