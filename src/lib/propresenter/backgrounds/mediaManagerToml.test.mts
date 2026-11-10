import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWorkspacePaths } from "./mediaManagerToml.ts";

test("reads the workspace path from the file ProPresenter writes on macOS", () => {
  // Verbatim from a real ProPresenter 21.4 install.
  const toml = `[[workspaces]]
path = "/Users/pma/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter"

[generator]

[preferences]
manage_media = false
share_analytics = false

[sync]

[feature_flags]
enabled = []
`;
  assert.deepEqual(parseWorkspacePaths(toml), [
    "/Users/pma/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter",
  ]);
});

test("unescapes Windows paths in basic strings", () => {
  const toml = '[[workspaces]]\r\npath = "C:\\\\Users\\\\Igreja\\\\AppData\\\\Roaming\\\\RenewedVision\\\\ProPresenter"\r\n';
  assert.deepEqual(parseWorkspacePaths(toml), ["C:\\Users\\Igreja\\AppData\\Roaming\\RenewedVision\\ProPresenter"]);
});

test("takes literal strings as written", () => {
  assert.deepEqual(parseWorkspacePaths("[[workspaces]]\npath = 'C:\\Users\\Igreja\\ProPresenter'\n"), [
    "C:\\Users\\Igreja\\ProPresenter",
  ]);
});

test("decodes unicode escapes and keeps accented names", () => {
  assert.deepEqual(parseWorkspacePaths('[[workspaces]]\npath = "/Users/jo\\u00e3o/Igreja São Paulo"\n'), [
    "/Users/joão/Igreja São Paulo",
  ]);
});

test("lists every workspace in order, ignoring paths outside workspace tables", () => {
  const toml = `path = "/not/a/workspace"
[[workspaces]]
path = "/first" # main
[[workspaces]]
  path   =   "/second"
[sync]
path = "/sync/folder"
`;
  assert.deepEqual(parseWorkspacePaths(toml), ["/first", "/second"]);
});

test("returns nothing for a file with no workspaces", () => {
  assert.deepEqual(parseWorkspacePaths("[preferences]\nmanage_media = false\n"), []);
  assert.deepEqual(parseWorkspacePaths(""), []);
});
