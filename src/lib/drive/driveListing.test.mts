import { test } from "node:test";
import assert from "node:assert/strict";
import { FOLDER_MIME_TYPE, sizedThumbnail, toDriveEntries, type DriveApiFile } from "./driveListing.ts";

const mediaTypeOf = (name: string) => (name.endsWith(".mp4") ? "video" : name.endsWith(".png") ? "image" : null);

const file = (overrides: Partial<DriveApiFile> & Pick<DriveApiFile, "id" | "name">): DriveApiFile => ({
  mimeType: "application/octet-stream",
  ...overrides,
});

test("lists folders first, then files, each newest first", () => {
  const entries = toDriveEntries(
    [
      file({ id: "old-video", name: "a.mp4", modifiedTime: "2026-11-01T10:00:00.000Z" }),
      file({ id: "old-week", name: "Semana 1", mimeType: FOLDER_MIME_TYPE, modifiedTime: "2026-11-02T10:00:00.000Z" }),
      file({ id: "new-image", name: "b.png", modifiedTime: "2026-11-09T10:00:00.000Z" }),
      file({ id: "new-week", name: "Semana 2", mimeType: FOLDER_MIME_TYPE, modifiedTime: "2026-11-08T10:00:00.000Z" }),
    ],
    mediaTypeOf,
  );
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["new-week", "old-week", "new-image", "old-video"],
  );
});

test("says which files the tray can take, and how big they are", () => {
  const [video, doc] = toDriveEntries(
    [
      file({ id: "v", name: "fundo.mp4", size: "1048576", modifiedTime: "2026-11-09T00:00:00.000Z" }),
      file({ id: "d", name: "Roteiro", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-11-01T00:00:00.000Z" }),
    ],
    mediaTypeOf,
  );
  assert.deepEqual(video, {
    id: "v",
    resourceKey: null,
    name: "fundo.mp4",
    kind: "file",
    modifiedTime: "2026-11-09T00:00:00.000Z",
    size: 1048576,
    mediaType: "video",
    thumbnailUrl: null,
  });
  assert.equal(doc.mediaType, null);
  assert.equal(doc.size, null);
});

test("follows a shortcut to the folder or file it points at", () => {
  const [folder, video] = toDriveEntries(
    [
      file({
        id: "s1",
        name: "Atalho da semana",
        mimeType: "application/vnd.google-apps.shortcut",
        shortcutDetails: { targetId: "real-folder", targetMimeType: FOLDER_MIME_TYPE, targetResourceKey: "0-key" },
      }),
      file({
        id: "s2",
        name: "loop.mp4",
        mimeType: "application/vnd.google-apps.shortcut",
        size: "10",
        shortcutDetails: { targetId: "real-video", targetMimeType: "video/mp4" },
      }),
    ],
    mediaTypeOf,
  );
  assert.deepEqual([folder.id, folder.kind, folder.resourceKey], ["real-folder", "folder", "0-key"]);
  assert.deepEqual([video.id, video.kind, video.mediaType, video.size], ["real-video", "file", "video", null]);
});

test("asks Drive for a thumbnail big enough for a tile", () => {
  const [entry] = toDriveEntries(
    [file({ id: "v", name: "fundo.mp4", thumbnailLink: "https://lh3.googleusercontent.com/drive-storage/abc=s220" })],
    mediaTypeOf,
  );
  assert.equal(entry.thumbnailUrl, "https://lh3.googleusercontent.com/drive-storage/abc=s480");
});

test("resizes both forms of Drive thumbnail link, and leaves any other alone", () => {
  assert.equal(sizedThumbnail("https://lh3.googleusercontent.com/x=s220", 480), "https://lh3.googleusercontent.com/x=s480");
  assert.equal(
    sizedThumbnail("https://docs.google.com/feeds/vt?gd=true&id=x&sz=s220&v=1", 480),
    "https://docs.google.com/feeds/vt?gd=true&id=x&sz=s480&v=1",
  );
  assert.equal(sizedThumbnail("https://example.com/thumb.png", 480), "https://example.com/thumb.png");
});

test("shows no thumbnail for a folder", () => {
  const [folder] = toDriveEntries(
    [file({ id: "f", name: "Semana", mimeType: FOLDER_MIME_TYPE, thumbnailLink: "https://lh3.googleusercontent.com/f=s220" })],
    mediaTypeOf,
  );
  assert.equal(folder.thumbnailUrl, null);
});
