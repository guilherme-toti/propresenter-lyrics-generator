import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * The disk side of swapping a macro's file: backups, the overwrite, restoring after a failure,
 * and undo and redo. A church could lose the only copy of its background here, so every write
 * leaves either the new file or the old one in place, never half of one, and every file it
 * overwrites is saved first. Only Node built-ins are imported, so `node --test` runs this against
 * a temp folder.
 */

/** A problem the user can fix, carried with the message to show. */
export class BackgroundsError extends Error {
  // A plain field, not a constructor parameter property: Node's type stripping can't run those.
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Node's error code for a failed file operation ("ENOENT", "EBUSY", …). */
export function errorCode(err: unknown): string | undefined {
  return err instanceof Error && "code" in err && typeof err.code === "string" ? err.code : undefined;
}

/** Besides a folder's first entry, which is always kept. Background videos can be hundreds of MB,
 * so a longer history would quietly fill the church computer's disk. */
const RECENT_BACKUPS_KEPT = 2;

const LOCKED_MESSAGE =
  "Esse arquivo está na tela agora. Limpe a tela no ProPresenter (ou em “Limpar tela”, aqui) e tente de novo.";
const DENIED_MESSAGE = "O computador não deixou trocar esse arquivo. Confira se ele não está protegido.";

export interface SwapTarget {
  /** The file a macro points to. Its path and name never change. */
  targetPath: string;
  /** This file's own backup folder: what each replace or redo overwrote, for "Desfazer". */
  backupDir: string;
  /** What each undo overwrote, for "Refazer". */
  redoDir: string;
  /** Whose error codes to read. The server passes its own; tests pass both. */
  platform?: NodeJS.Platform;
}

export interface ReplaceRequest extends SwapTarget {
  /** Writes the new contents over `targetPath`, in place. */
  write: (targetPath: string) => Promise<void>;
  /** The user's file, to tell "the source vanished" apart from "the target's folder vanished". */
  sourcePath?: string;
}

/** Windows won't overwrite a file another program has open, which ProPresenter does with
 * whatever is on screen. Elsewhere EPERM means something else (a Finder lock, a privacy denial). */
function isLockedError(err: unknown, platform: NodeJS.Platform): boolean {
  const code = errorCode(err);
  return code === "EBUSY" || (code === "EPERM" && platform === "win32");
}

async function isFile(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then((stat) => stat.isFile())
    .catch(() => false);
}

/** Size and modified time, to tell whether a failed write got as far as touching the file. */
async function fingerprint(filePath: string): Promise<string | null> {
  const stat = await fs.stat(filePath, { bigint: true }).catch(() => null);
  return stat ? `${stat.size}:${stat.mtimeNs}` : null;
}

function backupStamp(backupPath: string): number {
  return Number.parseInt(path.basename(backupPath), 10);
}

/** Oldest first. Each backup, in either folder, is named `<epoch ms>-<file name>`. */
async function listBackups(backupDir: string): Promise<string[]> {
  const names = await fs.readdir(backupDir).catch(() => []);
  return names
    .map((name) => path.join(backupDir, name))
    .filter((backupPath) => Number.isFinite(backupStamp(backupPath)))
    .sort((a, b) => backupStamp(a) - backupStamp(b));
}

export async function hasBackups(backupDir: string): Promise<boolean> {
  return (await listBackups(backupDir)).length > 0;
}

function comparablePath(filePath: string, platform: NodeJS.Platform): string {
  const resolved = path.resolve(filePath).normalize("NFC");
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** Whether two paths reach the same file: different letter case on a case-insensitive disk,
 * decomposed accents, symlinks and hard links all count as the same file. */
export async function isSameFile(a: string, b: string, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  const [statA, statB] = await Promise.all(
    [a, b].map((filePath) => fs.stat(filePath, { bigint: true }).catch(() => null)),
  );
  if (!statA || !statB) return false;
  // Some Windows filesystems (FAT drives, network shares) report no inode at all, which would
  // make every pair of files look identical.
  if (statA.ino === BigInt(0) || statB.ino === BigInt(0)) {
    return comparablePath(a, platform) === comparablePath(b, platform);
  }
  return statA.dev === statB.dev && statA.ino === statB.ino;
}

async function takeBackup(targetPath: string, backupDir: string): Promise<string | null> {
  if (!(await isFile(targetPath))) return null;
  await fs.mkdir(backupDir, { recursive: true });

  // Strictly after the newest one, so two backups in the same millisecond still sort in order.
  const newest = (await listBackups(backupDir)).at(-1);
  const stamp = Math.max(Date.now(), newest ? backupStamp(newest) + 1 : 0);
  const backupPath = path.join(backupDir, `${stamp}-${path.basename(targetPath)}`);
  try {
    // A clone costs next to nothing on APFS and falls back to a plain copy elsewhere. EXCL: a
    // backup is never overwritten.
    await fs.copyFile(targetPath, backupPath, constants.COPYFILE_FICLONE | constants.COPYFILE_EXCL);
  } catch (err) {
    if (errorCode(err) !== "EEXIST") await fs.rm(backupPath, { force: true });
    throw err;
  }
  return backupPath;
}

/** Best effort: callers only clean up once the file is in place, and a leftover only costs disk. */
async function removeQuietly(backupPaths: string[]): Promise<void> {
  await Promise.all(
    backupPaths.map((backupPath) =>
      fs.rm(backupPath, { force: true }).catch((err: unknown) => {
        console.warn("backgrounds: could not remove an old backup", err);
      }),
    ),
  );
}

/**
 * Keeps a folder's first entry and its most recent few. In the backups the first is the file as
 * it was before the app first touched it; in the redo folder it's the newest file sent, the one an
 * extra "Desfazer" must never cost. Undo and redo each move one file from one folder to the
 * other, so the redo folder never outgrows what the backups held, unless an entry couldn't be
 * removed and the same file got saved again. Runs only after a successful write, so a refused
 * attempt never costs a backup.
 */
async function pruneBackups(backupDir: string): Promise<void> {
  const backups = await listBackups(backupDir);
  await removeQuietly(backups.slice(1, Math.max(1, backups.length - RECENT_BACKUPS_KEPT)));
}

/** Windows' CopyFile keeps the source's modified time, which can be older than the file it
 * replaced; a fresh time is what tells the preview, and anything else keyed on it, that the file
 * changed. Best effort: by now the file is already in place. */
async function touch(filePath: string): Promise<void> {
  const now = new Date();
  await fs.utimes(filePath, now, now).catch((err: unknown) => {
    console.warn("backgrounds: could not refresh the modified time", err);
  });
}

/** A write the computer refused (the file is on screen, or protected), which trying again won't
 * fix. Null for any other failure. */
function accessFailure(err: unknown, platform: NodeJS.Platform): BackgroundsError | null {
  if (isLockedError(err, platform)) return new BackgroundsError(LOCKED_MESSAGE, 409);
  const code = errorCode(err);
  if (code === "EACCES" || code === "EPERM") return new BackgroundsError(DENIED_MESSAGE, 409);
  return null;
}

/** The message for a write that failed without changing the target. */
async function untouchedFailure(err: unknown, request: ReplaceRequest, platform: NodeJS.Platform) {
  const refused = accessFailure(err, platform);
  if (refused) return refused;
  const code = errorCode(err);
  if (code === "ENOENT") {
    const sourceGone = request.sourcePath !== undefined && !(await isFile(request.sourcePath));
    return new BackgroundsError(
      sourceGone
        ? "O arquivo escolhido não está mais lá. Se ele estava num pendrive, conecte de novo e tente outra vez."
        : "A pasta desse arquivo não existe mais. Confira a macro no ProPresenter.",
      409,
    );
  }
  console.error("backgrounds: replace failed before changing the file", err);
  return new BackgroundsError("Não deu pra trocar o arquivo. Nada mudou; tente de novo.", 500);
}

/** How a failed overwrite is explained; each action words it for its own button. */
interface OverwriteMessages {
  /** The write failed before changing anything. */
  untouched: (err: unknown) => BackgroundsError | Promise<BackgroundsError>;
  /** It failed partway where there was no file before, so the partial one was removed. */
  noPrevious: string;
  /** It failed partway, and the file from before is back in place. */
  restored: string;
  /** It failed partway, and putting the file from before back failed too. That file stays saved. */
  notRestored: string;
}

/**
 * Saves the target into `saveDir`, then overwrites it in place. If the write fails partway (a pen
 * drive pulled out, a full disk), the saved copy is put back so the macro keeps a whole file; if
 * even that fails, the copy stays saved for the user to bring back.
 */
async function overwriteSaving(
  targetPath: string,
  saveDir: string,
  write: (targetPath: string) => Promise<void>,
  messages: OverwriteMessages,
): Promise<void> {
  const before = await fingerprint(targetPath);
  const savedPath = await takeBackup(targetPath, saveDir);

  try {
    await write(targetPath);
  } catch (err) {
    if ((await fingerprint(targetPath)) === before) {
      // Nothing was written, so the saved copy only duplicates the file already in place.
      if (savedPath) await fs.rm(savedPath, { force: true });
      throw await messages.untouched(err);
    }

    console.error("backgrounds: overwrite failed partway", err);
    if (!savedPath) {
      // There was no file before, so a partial one would only be worse than none.
      await fs.rm(targetPath, { force: true }).catch(() => undefined);
      throw new BackgroundsError(messages.noPrevious, 500);
    }
    try {
      await fs.copyFile(savedPath, targetPath);
    } catch (restoreErr) {
      console.error("backgrounds: restoring the previous file failed", restoreErr);
      throw new BackgroundsError(messages.notRestored, 500);
    }
    await fs.rm(savedPath, { force: true });
    throw new BackgroundsError(messages.restored, 500);
  }

  await touch(targetPath);
}

/**
 * Backs the target up, then overwrites it in place, keeping a whole file even when the write
 * fails partway. Pruning, and forgetting what "Refazer" could bring back, only happen once the
 * new file is fully in place.
 */
export async function replaceFile(request: ReplaceRequest): Promise<void> {
  const platform = request.platform ?? process.platform;
  await overwriteSaving(request.targetPath, request.backupDir, request.write, {
    untouched: (err) => untouchedFailure(err, request, platform),
    noPrevious: "Não deu pra copiar o arquivo escolhido. Tente de novo.",
    restored: "Não deu pra copiar o arquivo escolhido. O anterior continua no lugar.",
    notRestored:
      "Não deu pra trocar o arquivo, e o anterior não voltou sozinho. Ele está guardado: clique em “Desfazer” para trazê-lo de volta.",
  });
  await pruneBackups(request.backupDir);
  // A new file starts a new history: what was undone before it can't come back on top of it.
  await removeQuietly(await listBackups(request.redoDir));
}

interface StepWording {
  /** For the log. */
  name: string;
  nothingLeft: string;
  /** Nothing changed: the file stayed as it was, and the one to put back is still saved. */
  failed: string;
  notRestored: string;
}

const UNDO: StepWording = {
  name: "undo",
  nothingLeft: "Não há troca pra desfazer nesse arquivo.",
  failed: "Não deu pra desfazer. O arquivo guardado continua salvo; tente de novo.",
  notRestored:
    "Não deu pra desfazer, e o arquivo de antes não voltou sozinho. Ele está guardado: clique em “Refazer” para trazê-lo de volta.",
};

const REDO: StepWording = {
  name: "redo",
  nothingLeft: "Não há nada pra refazer nesse arquivo.",
  failed: "Não deu pra refazer. O arquivo guardado continua salvo; tente de novo.",
  notRestored:
    "Não deu pra refazer, e o arquivo de antes não voltou sozinho. Ele está guardado: clique em “Desfazer” para trazê-lo de volta.",
};

/** Puts the newest file in `fromDir` back over the target, saving the target into `toDir` first so
 * the step can always be taken back. */
async function stepHistory(target: SwapTarget, fromDir: string, toDir: string, step: StepWording): Promise<void> {
  const platform = target.platform ?? process.platform;
  const entry = (await listBackups(fromDir)).at(-1);
  if (!entry) throw new BackgroundsError(step.nothingLeft, 404);

  await overwriteSaving(target.targetPath, toDir, (targetPath) => fs.copyFile(entry, targetPath), {
    untouched: (err) => {
      const refused = accessFailure(err, platform);
      if (refused) return refused;
      console.error(`backgrounds: ${step.name} failed`, err);
      return new BackgroundsError(step.failed, 500);
    },
    noPrevious: step.failed,
    restored: step.failed,
    notRestored: step.notRestored,
  });
  // Pruned before the entry goes: if removing it fails, the next step saves the same file again,
  // and the cap still has to hold.
  await pruneBackups(toDir);
  // Only now that it's in place: until then it may be the only whole copy, and trying again is
  // always safe. Best effort: the step already worked, and reporting it as failed would only make
  // the user repeat it.
  await fs.rm(entry, { force: true }).catch((err: unknown) => {
    console.warn(`backgrounds: ${step.name} worked, but its entry couldn't be removed`, err);
  });
}

/** Puts back the newest backup, saving the file it overwrites for "Refazer". Repeated undos walk
 * back one replace at a time. */
export function undoLatest(target: SwapTarget): Promise<void> {
  return stepHistory(target, target.backupDir, target.redoDir, UNDO);
}

/** Puts back the file the latest undo overwrote, saving the one it overwrites for "Desfazer". */
export function redoLatest(target: SwapTarget): Promise<void> {
  return stepHistory(target, target.redoDir, target.backupDir, REDO);
}

type FileQueues = Map<string, Promise<unknown>>;

/** One queue per process: Next can load this module once per route bundle, and replace, undo and
 * redo are different routes. */
function fileQueues(): FileQueues {
  const store = globalThis as typeof globalThis & { __pmaBackgroundsFileQueues?: FileQueues };
  store.__pmaBackgroundsFileQueues ??= new Map();
  return store.__pmaBackgroundsFileQueues;
}

/** A name `createBeside` never gets past: something is wrong with the names, not the folder. */
const MAX_NEW_NAME_ATTEMPTS = 100;

/** How a new file gets its contents. Each must fail with EEXIST rather than write over a file. */
export type NewFileContents = { copyOf: string } | { bytes: Uint8Array };

/**
 * Creates a file in `folder` under the first name `nameFor(1)`, `nameFor(2)`, … that isn't taken,
 * and returns that name. Never writes over a file: a taken name is skipped, not replaced.
 */
export async function createBeside(
  folder: string,
  nameFor: (attempt: number) => string,
  contents: NewFileContents,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_NEW_NAME_ATTEMPTS; attempt += 1) {
    const name = nameFor(attempt);
    const target = path.join(folder, name);
    try {
      if ("copyOf" in contents) await fs.copyFile(contents.copyOf, target, constants.COPYFILE_EXCL);
      else await fs.writeFile(target, contents.bytes, { flag: "wx" });
      return name;
    } catch (err) {
      if (errorCode(err) === "EEXIST") continue;
      // Past EEXIST the name was free, so whatever is there now is this attempt's partial file.
      if ("bytes" in contents) await fs.rm(target, { force: true }).catch(() => undefined);
      throw err;
    }
  }
  throw new Error(`createBeside: no free name after ${MAX_NEW_NAME_ATTEMPTS} attempts`);
}

/** Runs tasks for the same key one after another, so a replace, an undo and a redo on one file can
 * never interleave their backups and writes. */
export async function withFileLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const queues = fileQueues();
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(task);
  const settled = run.catch(() => undefined);
  queues.set(key, settled);
  try {
    return await run;
  } finally {
    if (queues.get(key) === settled) queues.delete(key);
  }
}
