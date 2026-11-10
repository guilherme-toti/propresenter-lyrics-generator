import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import type { PathLike, RmOptions } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  BackgroundsError,
  hasBackups,
  isSameFile,
  redoLatest,
  replaceFile,
  undoLatest,
  withFileLock,
} from "./fileSwap.ts";

let dir: string;
let targetPath: string;
let backupDir: string;
let redoDir: string;

beforeEach(async () => {
  // The module logs what it can't show the user; that's noise here.
  mock.method(console, "error", () => undefined);
  mock.method(console, "warn", () => undefined);
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "pma-fileswap-"));
  await fs.mkdir(path.join(dir, "Assets"));
  targetPath = path.join(dir, "Assets", "fundo.png");
  backupDir = path.join(dir, "backups", "slot");
  redoDir = path.join(dir, "redo", "slot");
  await fs.writeFile(targetPath, "original");
});

afterEach(async () => {
  mock.restoreAll();
  await fs.rm(dir, { recursive: true, force: true });
});

const writeText = (text: string) => (target: string) => fs.writeFile(target, text);

function failingWith(code: string, partial?: string) {
  return async (target: string) => {
    if (partial !== undefined) await fs.writeFile(target, partial);
    throw Object.assign(new Error(code), { code });
  };
}

/** Oldest first, the order the module names them in. */
async function savedContents(folder: string): Promise<string[]> {
  const names = await fs.readdir(folder).catch(() => []);
  const sorted = names.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  return Promise.all(sorted.map((name) => fs.readFile(path.join(folder, name), "utf-8")));
}

const backupContents = () => savedContents(backupDir);

const read = (filePath: string) => fs.readFile(filePath, "utf-8");

const swapTarget = () => ({ targetPath, backupDir, redoDir });

async function replaceWith(text: string) {
  await replaceFile({ ...swapTarget(), write: writeText(text) });
}

/** Makes copies onto the target fail with `code`, after writing `partial` when given, the way a
 * file on screen or a pulled-out drive would. With `fromDir`, only copies out of that folder. */
function failCopiesOntoTarget(code: string, { partial, fromDir }: { partial?: string; fromDir?: string } = {}) {
  const copyFile = fs.copyFile;
  return mock.method(fs, "copyFile", async (source: PathLike, destination: PathLike, mode?: number) => {
    const fromThere = fromDir === undefined || path.dirname(String(source)) === fromDir;
    if (destination !== targetPath || !fromThere) return copyFile(source, destination, mode);
    if (partial !== undefined) await fs.writeFile(targetPath, partial);
    throw Object.assign(new Error(code), { code });
  });
}

function assertNothingLeft(err: unknown) {
  assert.ok(err instanceof BackgroundsError);
  assert.equal(err.status, 404);
  return true;
}

function assertOnScreen(err: unknown) {
  assert.ok(err instanceof BackgroundsError);
  assert.equal(err.status, 409);
  assert.match(err.message, /na tela/);
  return true;
}

test("backs the file up before every overwrite", async () => {
  await replaceWith("A");
  assert.equal(await read(targetPath), "A");
  assert.deepEqual(await backupContents(), ["original"]);

  await replaceWith("B");
  assert.equal(await read(targetPath), "B");
  assert.deepEqual(await backupContents(), ["original", "A"]);
});

test("keeps the original plus the two latest backups, even across many replaces in one millisecond", async () => {
  for (const text of ["A", "B", "C", "D", "E"]) await replaceWith(text);
  assert.equal(await read(targetPath), "E");
  assert.deepEqual(await backupContents(), ["original", "C", "D"]);
});

test("prunes only after a successful write: a refused attempt costs no backup", async () => {
  for (const text of ["A", "B", "C"]) await replaceWith(text);
  assert.deepEqual(await backupContents(), ["original", "A", "B"]);

  await assert.rejects(
    replaceFile({ ...swapTarget(), platform: "win32", write: failingWith("EBUSY") }),
    BackgroundsError,
  );
  assert.deepEqual(await backupContents(), ["original", "A", "B"]);
  assert.equal(await read(targetPath), "C");
});

test("undo walks back newest first, then says there is nothing left", async () => {
  await replaceWith("A");
  await replaceWith("B");

  await undoLatest(swapTarget());
  assert.equal(await read(targetPath), "A");
  assert.equal(await hasBackups(backupDir), true);

  await undoLatest(swapTarget());
  assert.equal(await read(targetPath), "original");
  assert.equal(await hasBackups(backupDir), false);

  await assert.rejects(undoLatest(swapTarget()), assertNothingLeft);
  assert.equal(await read(targetPath), "original");
});

test("redo puts back the file an undo replaced", async () => {
  await replaceWith("A");
  await undoLatest(swapTarget());
  assert.equal(await read(targetPath), "original");
  assert.deepEqual(await savedContents(redoDir), ["A"]);

  await redoLatest(swapTarget());
  assert.equal(await read(targetPath), "A");
  assert.equal(await hasBackups(redoDir), false);
  assert.deepEqual(await backupContents(), ["original"], "Desfazer can take the redo back again");

  await assert.rejects(redoLatest(swapTarget()), assertNothingLeft);
  assert.equal(await read(targetPath), "A");
});

test("two undos and then two redos come back to the newest file", async () => {
  await replaceWith("A");
  await replaceWith("B");
  await undoLatest(swapTarget());
  await undoLatest(swapTarget());
  assert.equal(await read(targetPath), "original");

  await redoLatest(swapTarget());
  assert.equal(await read(targetPath), "A");
  await redoLatest(swapTarget());
  assert.equal(await read(targetPath), "B");
  assert.deepEqual(await backupContents(), ["original", "A"]);
  assert.equal(await hasBackups(redoDir), false);
});

test("undoing past every kept backup and redoing all the way loses no file", async () => {
  for (const text of ["A", "B", "C"]) await replaceWith(text);
  for (const expected of ["B", "A", "original"]) {
    await undoLatest(swapTarget());
    assert.equal(await read(targetPath), expected);
  }
  assert.deepEqual(await savedContents(redoDir), ["C", "B", "A"]);

  for (const expected of ["A", "B", "C"]) {
    await redoLatest(swapTarget());
    assert.equal(await read(targetPath), expected);
  }
  assert.deepEqual(await backupContents(), ["original", "A", "B"]);
  assert.equal(await hasBackups(redoDir), false);
});

test("a new file after an undo forgets what redo could have brought back", async () => {
  await replaceWith("A");
  await replaceWith("B");
  await undoLatest(swapTarget());
  await replaceWith("C");

  assert.equal(await hasBackups(redoDir), false);
  await assert.rejects(redoLatest(swapTarget()), assertNothingLeft);
  assert.equal(await read(targetPath), "C");
  assert.deepEqual(await backupContents(), ["original", "A"]);
});

test("a refused replace keeps what redo can bring back", async () => {
  await replaceWith("A");
  await undoLatest(swapTarget());
  await assert.rejects(replaceFile({ ...swapTarget(), write: failingWith("EBUSY") }), assertOnScreen);

  assert.deepEqual(await savedContents(redoDir), ["A"]);
  await redoLatest(swapTarget());
  assert.equal(await read(targetPath), "A");
});

test("the redo stack stays capped even when undo can't drop the backup it put back", async () => {
  for (const text of ["A", "B", "C"]) await replaceWith(text);
  // The backup survives each undo, so every try puts it back again and saves the same file once more.
  const rm = fs.rm;
  mock.method(fs, "rm", async (filePath: PathLike, options?: RmOptions) => {
    if (path.dirname(String(filePath)) === backupDir) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    return rm(filePath, options);
  });
  for (let attempt = 0; attempt < 5; attempt += 1) await undoLatest(swapTarget()).catch(() => undefined);

  assert.equal(await read(targetPath), "B");
  assert.deepEqual(await savedContents(redoDir), ["C", "B", "B"], "the newest file sent is never the one dropped");
});

test("an undo that worked isn't reported as failed when its backup can't be removed", async () => {
  await replaceWith("A");
  const rm = fs.rm;
  mock.method(fs, "rm", async (filePath: PathLike, options?: RmOptions) => {
    if (path.dirname(String(filePath)) === backupDir) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    return rm(filePath, options);
  });
  await undoLatest(swapTarget());
  assert.equal(await read(targetPath), "original");
  assert.deepEqual(await savedContents(redoDir), ["A"]);
});

test("a protected file says so on undo and redo, instead of asking to try again", async () => {
  await replaceWith("A");
  const assertDenied = (err: unknown) => {
    assert.ok(err instanceof BackgroundsError);
    assert.match(err.message, /não deixou trocar/);
    return true;
  };

  const denied = failCopiesOntoTarget("EACCES", { fromDir: backupDir });
  await assert.rejects(undoLatest({ ...swapTarget(), platform: "darwin" }), assertDenied);
  denied.mock.restore();
  assert.equal(await read(targetPath), "A");

  await undoLatest(swapTarget());
  const deniedRedo = failCopiesOntoTarget("EACCES", { fromDir: redoDir });
  await assert.rejects(redoLatest({ ...swapTarget(), platform: "darwin" }), assertDenied);
  deniedRedo.mock.restore();
  assert.equal(await read(targetPath), "original");
});

test("an undo that can't put the backup in place keeps it, and never costs the file it was replacing", async () => {
  await replaceWith("A");

  const onScreen = failCopiesOntoTarget("EBUSY");
  await assert.rejects(undoLatest(swapTarget()), assertOnScreen);
  onScreen.mock.restore();
  assert.equal(await read(targetPath), "A");
  assert.deepEqual(await backupContents(), ["original"]);
  assert.equal(await hasBackups(redoDir), false);

  const cutOff = failCopiesOntoTarget("EIO", { partial: "hal", fromDir: backupDir });
  await assert.rejects(undoLatest(swapTarget()), /continua salvo/);
  cutOff.mock.restore();
  assert.equal(await read(targetPath), "A", "the file it was replacing goes back in place");
  assert.deepEqual(await backupContents(), ["original"]);
  assert.equal(await hasBackups(redoDir), false);

  const broken = failCopiesOntoTarget("EIO", { partial: "hal" });
  await assert.rejects(undoLatest(swapTarget()), /Refazer/);
  broken.mock.restore();
  assert.deepEqual(await backupContents(), ["original"]);
  assert.deepEqual(await savedContents(redoDir), ["A"]);
  await redoLatest(swapTarget());
  assert.equal(await read(targetPath), "A");
});

test("a redo that can't put its file in place keeps it, and never costs the file it was replacing", async () => {
  await replaceWith("A");
  await undoLatest(swapTarget());

  const onScreen = failCopiesOntoTarget("EBUSY");
  await assert.rejects(redoLatest(swapTarget()), assertOnScreen);
  onScreen.mock.restore();
  assert.equal(await read(targetPath), "original");
  assert.deepEqual(await savedContents(redoDir), ["A"]);
  assert.equal(await hasBackups(backupDir), false);

  const broken = failCopiesOntoTarget("EIO", { partial: "hal" });
  await assert.rejects(redoLatest(swapTarget()), /Desfazer/);
  broken.mock.restore();
  assert.deepEqual(await savedContents(redoDir), ["A"]);
  assert.deepEqual(await backupContents(), ["original"]);
  await undoLatest(swapTarget());
  assert.equal(await read(targetPath), "original");
});

test("a file locked on screen stays as it was, and only the new backup is dropped", async () => {
  await replaceWith("A");
  for (const [code, platform] of [
    ["EBUSY", "darwin"],
    ["EBUSY", "win32"],
    ["EPERM", "win32"],
  ] as const) {
    await assert.rejects(replaceFile({ ...swapTarget(), platform, write: failingWith(code) }), assertOnScreen);
    assert.equal(await read(targetPath), "A");
    assert.deepEqual(await backupContents(), ["original"]);
  }
});

test("EPERM outside Windows is a permission problem, not a file on screen", async () => {
  await assert.rejects(replaceFile({ ...swapTarget(), platform: "darwin", write: failingWith("EPERM") }), (err: unknown) => {
    assert.ok(err instanceof BackgroundsError);
    assert.match(err.message, /não deixou trocar/);
    return true;
  });
  assert.equal(await read(targetPath), "original");
  assert.equal(await hasBackups(backupDir), false);
});

test("a write that fails partway puts the previous file back", async () => {
  await replaceWith("A");
  await assert.rejects(replaceFile({ ...swapTarget(), write: failingWith("EIO", "hal") }), (err: unknown) => {
    assert.ok(err instanceof BackgroundsError);
    assert.match(err.message, /anterior continua no lugar/);
    return true;
  });
  assert.equal(await read(targetPath), "A");
  assert.deepEqual(await backupContents(), ["original"]);
});

test("when putting the previous file back also fails, its backup is kept for Desfazer", { skip: process.getuid?.() === 0 }, async () => {
  const lockBackups = async (target: string) => {
    await fs.writeFile(target, "hal");
    for (const name of await fs.readdir(backupDir)) await fs.chmod(path.join(backupDir, name), 0o000);
    throw Object.assign(new Error("EIO"), { code: "EIO" });
  };
  try {
    await assert.rejects(replaceFile({ ...swapTarget(), write: lockBackups }), (err: unknown) => {
      assert.ok(err instanceof BackgroundsError);
      assert.match(err.message, /Desfazer/);
      return true;
    });
    assert.equal(await hasBackups(backupDir), true);
  } finally {
    for (const name of await fs.readdir(backupDir)) await fs.chmod(path.join(backupDir, name), 0o644);
  }
  await undoLatest(swapTarget());
  assert.equal(await read(targetPath), "original");
});

test("names a vanished source as the problem, and a missing folder otherwise", async () => {
  const gone = path.join(dir, "pendrive", "novo.png");
  await assert.rejects(
    replaceFile({ ...swapTarget(), sourcePath: gone, write: (target) => fs.copyFile(gone, target) }),
    /não está mais lá/,
  );
  assert.equal(await read(targetPath), "original");

  const source = path.join(dir, "novo.png");
  await fs.writeFile(source, "novo");
  const orphan = path.join(dir, "Apagada", "fundo.png");
  await assert.rejects(
    replaceFile({ ...swapTarget(), targetPath: orphan, sourcePath: source, write: (target) => fs.copyFile(source, target) }),
    /pasta desse arquivo não existe/,
  );
});

test("a failed write where there was no file before leaves no partial file behind", async () => {
  const fresh = path.join(dir, "Assets", "novo.png");
  await assert.rejects(replaceFile({ ...swapTarget(), targetPath: fresh, write: failingWith("EIO", "hal") }), BackgroundsError);
  await assert.rejects(fs.stat(fresh));
  assert.equal(await hasBackups(backupDir), false);
});

test("recognises the same file through hard links, symlinks and letter case", async () => {
  const other = path.join(dir, "outro.png");
  await fs.writeFile(other, "original");
  const hardLink = path.join(dir, "hard.png");
  const symlink = path.join(dir, "link.png");
  await fs.link(targetPath, hardLink);
  await fs.symlink(targetPath, symlink);

  assert.equal(await isSameFile(targetPath, targetPath), true);
  assert.equal(await isSameFile(targetPath, hardLink), true);
  assert.equal(await isSameFile(targetPath, symlink), true);
  assert.equal(await isSameFile(targetPath, other), false);
  assert.equal(await isSameFile(targetPath, path.join(dir, "nada.png")), false);

  const upperCase = path.join(dir, "Assets", "FUNDO.PNG");
  const caseInsensitiveDisk = await fs.stat(upperCase).then(() => true, () => false);
  if (caseInsensitiveDisk) assert.equal(await isSameFile(targetPath, upperCase), true);
});

test("runs tasks for the same file one at a time, even when one fails", async () => {
  const order: string[] = [];
  const slow = withFileLock("slot", async () => {
    order.push("a-start");
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("a-end");
    throw new Error("a failed");
  });
  const next = withFileLock("slot", async () => {
    order.push("b");
    return "b-done";
  });
  const elsewhere = withFileLock("other-slot", async () => {
    order.push("other");
  });

  await assert.rejects(slow, /a failed/);
  assert.equal(await next, "b-done");
  await elsewhere;
  assert.deepEqual(
    order.filter((step) => step !== "other"),
    ["a-start", "a-end", "b"],
  );
  assert.ok(order.indexOf("other") < order.indexOf("a-end"), "a different file isn't held up");
});
