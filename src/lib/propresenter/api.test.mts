import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flattenPlaylists,
  namesMatch,
  presentationItem,
  toPutItem,
  type PlaylistApiItem,
  type PlaylistTreeNode,
} from "./api.ts";

const header: PlaylistApiItem = {
  id: { uuid: "1E546E96-F193-4344-8BE1-FF07E3029354", name: "Music", index: 1 },
  type: "header",
  is_hidden: false,
  is_pco: false,
  header_color: { red: 0.28, green: 0.6, blue: 0.78, alpha: 1 },
};

const presentation: PlaylistApiItem = {
  id: { uuid: "1F736F53-907E-4949-8AE4-D970EFFFC2B1", name: "É Ele (2)", index: 3 },
  type: "presentation",
  is_hidden: false,
  is_pco: false,
  presentation_info: {
    presentation_uuid: "1186633D-57AB-4952-8898-885B8A77D473",
    arrangement_name: "",
    arrangement_uuid: "",
  },
};

test("gives an itemless entry an empty-string target_uuid, never null", () => {
  // ProPresenter's own OpenAPI document declares target_uuid nullable, but its
  // deserializer rejects null with "invalid type: null, expected a string".
  const result = toPutItem(header, 1);

  assert.equal(result.target_uuid, "");
});

test("takes target_uuid from presentation_info for a presentation item", () => {
  const result = toPutItem(presentation, 3);

  assert.equal(result.target_uuid, "1186633D-57AB-4952-8898-885B8A77D473");
  assert.deepEqual(result.presentation_info, presentation.presentation_info);
});

test("preserves header_color so re-writing a playlist doesn't flatten its headers", () => {
  const result = toPutItem(header, 1);

  assert.deepEqual(result.header_color, { red: 0.28, green: 0.6, blue: 0.78, alpha: 1 });
});

test("omits header_color and presentation_info when the source item has neither", () => {
  const placeholder: PlaylistApiItem = {
    id: { uuid: "F589DE7D-41CD-4AA2-A983-EAA2F4CBAC28", name: "Placeholder", index: 0 },
    type: "placeholder",
  };

  const result = toPutItem(placeholder, 0);

  assert.equal("header_color" in result, false);
  assert.equal("presentation_info" in result, false);
  assert.equal(result.is_hidden, false);
  assert.equal(result.is_pco, false);
});

test("renumbers index to the item's new position", () => {
  const result = toPutItem(presentation, 7) as { id: { index: number; uuid: string } };

  assert.equal(result.id.index, 7);
  assert.equal(result.id.uuid, "1F736F53-907E-4949-8AE4-D970EFFFC2B1");
});

test("builds a new presentation item that carries its uuid in both places", () => {
  const uuid = "FB3619D9-97A1-48BF-9BD5-C60CCDFFF873";

  const result = presentationItem(uuid, "É Ele (3)", 5) as {
    id: { uuid: string; name: string; index: number };
    type: string;
    target_uuid: string;
    presentation_info: { presentation_uuid: string };
  };

  assert.equal(result.type, "presentation");
  assert.equal(result.target_uuid, uuid);
  assert.equal(result.presentation_info.presentation_uuid, uuid);
  assert.deepEqual(result.id, { uuid, name: "É Ele (3)", index: 5 });
});

test("matches library names across macOS NFD and JavaScript NFC forms", () => {
  // The API returns names read from the filesystem, where macOS stores "É" as
  // NFD (E + combining acute). A name built in JS is NFC. Comparing them raw
  // silently finds nothing.
  const fromApi = "É Ele (3)".normalize("NFD");
  const fromExport = "É Ele (3)".normalize("NFC");

  assert.notEqual(fromApi, fromExport);
  assert.equal(namesMatch(fromApi, fromExport), true);
});

test("does not match genuinely different names", () => {
  assert.equal(namesMatch("É Ele (3)", "É Ele (2)"), false);
});

test("flattens a real two-playlist response with no groups", () => {
  // Real observed response from GET /v1/playlists.
  const tree: PlaylistTreeNode[] = [
    {
      id: { uuid: "0CF150E4-389D-41A2-BE19-0031C222D76A", name: "WORSHIP HOJE", index: 0 },
      field_type: "playlist",
      children: [],
    },
    {
      id: { uuid: "07F7CA0F-7DC8-459F-BDDE-B5DC6800E9A3", name: "SEP 2", index: 1 },
      field_type: "playlist",
      children: [],
    },
  ];

  assert.deepEqual(flattenPlaylists(tree), [
    { id: "0CF150E4-389D-41A2-BE19-0031C222D76A", name: "WORSHIP HOJE" },
    { id: "07F7CA0F-7DC8-459F-BDDE-B5DC6800E9A3", name: "SEP 2" },
  ]);
});

test("descends into a group's children to find its playlists", () => {
  const tree: PlaylistTreeNode[] = [
    {
      id: { uuid: "GROUP-1", name: "Domingo", index: 0 },
      field_type: "group",
      children: [
        { id: { uuid: "P1", name: "Manhã", index: 0 }, field_type: "playlist", children: [] },
        { id: { uuid: "P2", name: "Noite", index: 1 }, field_type: "playlist", children: [] },
      ],
    },
  ];

  assert.deepEqual(flattenPlaylists(tree), [
    { id: "P1", name: "Manhã" },
    { id: "P2", name: "Noite" },
  ]);
});

test("descends through nested groups", () => {
  const tree: PlaylistTreeNode[] = [
    {
      id: { uuid: "OUTER", name: "2026", index: 0 },
      field_type: "group",
      children: [
        {
          id: { uuid: "INNER", name: "Setembro", index: 0 },
          field_type: "group",
          children: [{ id: { uuid: "P1", name: "SEP 2", index: 0 }, field_type: "playlist", children: [] }],
        },
      ],
    },
  ];

  assert.deepEqual(flattenPlaylists(tree), [{ id: "P1", name: "SEP 2" }]);
});

test("does not collect a group node itself as a playlist", () => {
  const tree: PlaylistTreeNode[] = [
    {
      id: { uuid: "GROUP-1", name: "Domingo", index: 0 },
      field_type: "group",
      children: [],
    },
  ];

  assert.deepEqual(flattenPlaylists(tree), []);
});

test("returns an empty array for an empty tree", () => {
  assert.deepEqual(flattenPlaylists([]), []);
});

test("skips a node missing a name", () => {
  const tree: PlaylistTreeNode[] = [
    {
      id: { uuid: "P1", name: "", index: 0 },
      field_type: "playlist",
      children: [],
    },
  ];

  assert.deepEqual(flattenPlaylists(tree), []);
});
