import { test } from "node:test";
import assert from "node:assert/strict";
import { driveFolderUrl, parseDriveFolderLink } from "./driveLinks.ts";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz_-012";

test("reads the folder from the address bar and from a share link", () => {
  for (const link of [
    `https://drive.google.com/drive/folders/${ID}`,
    `https://drive.google.com/drive/folders/${ID}?usp=sharing`,
    `https://drive.google.com/drive/u/0/folders/${ID}`,
    `https://drive.google.com/drive/u/1/folders/${ID}/`,
    `drive.google.com/drive/folders/${ID}`,
    `  https://drive.google.com/drive/folders/${ID}  `,
  ]) {
    assert.deepEqual(parseDriveFolderLink(link), { id: ID, resourceKey: null }, link);
  }
});

test("reads the older open?id= and folderview?id= links", () => {
  assert.deepEqual(parseDriveFolderLink(`https://drive.google.com/open?id=${ID}`), { id: ID, resourceKey: null });
  assert.deepEqual(parseDriveFolderLink(`https://drive.google.com/folderview?id=${ID}`), { id: ID, resourceKey: null });
});

test("keeps the resource key an older share link carries", () => {
  assert.deepEqual(parseDriveFolderLink(`https://drive.google.com/drive/folders/${ID}?resourcekey=0-AbCdEfGhIjKl`), {
    id: ID,
    resourceKey: "0-AbCdEfGhIjKl",
  });
});

test("takes a bare folder id", () => {
  assert.deepEqual(parseDriveFolderLink(ID), { id: ID, resourceKey: null });
});

test("refuses what isn't a Drive folder link", () => {
  for (const link of [
    "",
    "oceans",
    `https://example.com/drive/folders/${ID}`,
    `https://drive.google.com.evil.com/drive/folders/${ID}`,
    `https://drive.google.com/file/d/${ID}/view`,
    "https://drive.google.com/drive/folders/short",
    "https://drive.google.com/drive/my-drive",
  ]) {
    assert.equal(parseDriveFolderLink(link), null, link);
  }
});

test("saves the link clean, whatever was pasted around it", () => {
  const ref = parseDriveFolderLink(`https://drive.google.com/drive/u/0/folders/${ID}?usp=sharing x`);
  assert.ok(ref);
  assert.equal(driveFolderUrl(ref), `https://drive.google.com/drive/folders/${ID}`);
  assert.equal(
    driveFolderUrl({ id: ID, resourceKey: "0-AbCdEfGhIjKl" }),
    `https://drive.google.com/drive/folders/${ID}?resourcekey=0-AbCdEfGhIjKl`,
  );
});
