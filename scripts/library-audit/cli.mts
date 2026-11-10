import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { buildAlignmentFromAiSections } from "@/lib/alignment";
import { decodeProFile } from "@/lib/propresenter/decode";
import { encodeSongAsProFile } from "@/lib/propresenter/encode";
import { artistFromCredits } from "@/lib/propresenter/importedArtist";
import { classifyCueLines } from "@/lib/propresenter/languageDetect";
import { fileNamesMatch, isPathInside, listProFiles } from "@/lib/propresenter/libraries";
import { createEmptySong, type Song } from "@/lib/types";
import {
  auditResultSchema,
  checkResult,
  exportedSongSchema,
  finalFileName,
  finalTitle,
  planMergeGroups,
  songIdFor,
  type AuditResult,
  type CheckedSong,
  type CheckOutcome,
  type ExportedSong,
  type MergeGroup,
  type OkResult,
  type ResearchedSong,
  unmergedDuplicates,
} from "./audit.ts";
import { googleSearch, readPage } from "./browser.ts";

const USAGE = `Usage: npm run library-audit -- <command> <workDir> …

  export <workDir> <libraryFolder>…  Read every .pro in each folder into <workDir>/songs
  search <workDir> "<query>"         Google, through Aside (one search at a time across agents)
  page <workDir> <songId> <url>      Save a page's lyrics to <workDir>/sources/<songId>/<n>.txt
                                     (--full: the whole page, when the lyrics weren't found)
  check <workDir> [songId]           Check one result, or all of them and write report.md
  check <workDir> --pending          Print the ids still without a result, as JSON
  apply <workDir> [--yes]            Show what would be written; --yes backs up and writes it
  apply <workDir> --only=<id>,… …    The same for only these songs (redo after a review)`;

const dirs = (workDir: string) => ({
  songs: path.join(workDir, "songs"),
  results: path.join(workDir, "results"),
  sources: path.join(workDir, "sources"),
});

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function exportLibrary(workDir: string, folders: string[]): Promise<void> {
  if (folders.length === 0) throw new Error("Name at least one library folder.");
  const { songs } = dirs(workDir);
  for (const folder of folders) {
    // Inside ProPresenter's Libraries folder, the work folder (and the backups in it) would show up
    // as one more library.
    const parent = path.dirname(path.resolve(folder));
    if (path.basename(parent).toLowerCase() === "libraries" && isPathInside(parent, path.resolve(workDir))) {
      throw new Error(`Keep ${workDir} outside ${parent}: ProPresenter would list it as a library.`);
    }
  }

  // Ids come from file names in a stable order, so a fresh export keeps every result's id.
  await fs.rm(songs, { recursive: true, force: true });
  await fs.mkdir(songs, { recursive: true });
  const taken = new Set<string>();
  const unreadable: string[] = [];
  let exported = 0;

  for (const folder of folders) {
    const libraryPath = path.resolve(folder);
    const library = path.basename(libraryPath);
    for (const file of await listProFiles({ name: library, path: libraryPath })) {
      try {
        const decoded = await decodeProFile(await fs.readFile(file.path));
        const song: ExportedSong = {
          id: songIdFor(`${folders.length > 1 ? `${library} ` : ""}${file.filename}`, taken),
          library,
          libraryPath,
          fileName: file.filename,
          title: decoded.title,
          artist: artistFromCredits(decoded),
          bilingual: classifyCueLines(decoded.cueLines).isBilingual,
          slides: decoded.cueLines,
        };
        await writeJson(path.join(songs, `${song.id}.json`), song);
        exported += 1;
      } catch {
        unreadable.push(file.path);
      }
    }
  }

  await writeJson(path.join(workDir, "unreadable.json"), unreadable);
  console.log(`Exported ${exported} songs to ${songs}.`);
  if (unreadable.length > 0) console.log(`Could not read ${unreadable.length} files — listed in unreadable.json.`);
}

async function loadSongs(workDir: string): Promise<ExportedSong[]> {
  const { songs } = dirs(workDir);
  const names = (await fs.readdir(songs)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(
    names.map(async (name) => exportedSongSchema.parse(JSON.parse(await fs.readFile(path.join(songs, name), "utf8")))),
  );
}

async function loadSong(workDir: string, id: string): Promise<ExportedSong> {
  const filePath = path.join(dirs(workDir).songs, `${id}.json`);
  if (!existsSync(filePath)) throw new Error(`No exported song "${id}" in ${workDir}.`);
  return exportedSongSchema.parse(JSON.parse(await fs.readFile(filePath, "utf8")));
}

type LoadedResult = { kind: "missing" } | { kind: "invalid"; error: string } | { kind: "ok"; result: AuditResult };

async function loadResult(workDir: string, id: string): Promise<LoadedResult> {
  const filePath = path.join(dirs(workDir).results, `${id}.json`);
  if (!existsSync(filePath)) return { kind: "missing" };
  try {
    const parsed = auditResultSchema.safeParse(JSON.parse(await fs.readFile(filePath, "utf8")));
    if (parsed.success) return { kind: "ok", result: parsed.data };
    return { kind: "invalid", error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
  } catch (error) {
    return { kind: "invalid", error: error instanceof Error ? error.message : String(error) };
  }
}

/** A song's saved pages, and only its own: every "web" line must come from a page saved for it. */
function sourceReader(workDir: string, id: string) {
  const songSources = path.join(dirs(workDir).sources, id);
  return (relativePath: string): string | null => {
    const resolved = path.resolve(workDir, relativePath);
    if (!isPathInside(songSources, resolved) || !existsSync(resolved)) return null;
    return readFileSync(resolved, "utf8");
  };
}

async function search(workDir: string, query: string | undefined): Promise<void> {
  if (!query?.trim()) throw new Error("Give the search a query.");
  console.log(JSON.stringify(await googleSearch(workDir, query), null, 2));
}

async function savePage(workDir: string, id: string | undefined, url: string | undefined, full: boolean): Promise<void> {
  if (!id || !url) throw new Error("Give the song id and the page URL.");
  await loadSong(workDir, id);
  const songSources = path.join(dirs(workDir).sources, id);
  await fs.mkdir(songSources, { recursive: true });

  const page = await readPage(workDir, url, full);
  const saved = (await fs.readdir(songSources)).filter((name) => name.endsWith(".txt")).length;
  const relativePath = path.join("sources", id, `${saved + 1}.txt`);
  const content = `URL: ${page.url}\nTitle: ${page.title}\n\n${page.text}\n`;
  await fs.writeFile(path.join(workDir, relativePath), content);
  console.log(`Saved ${relativePath}\n\n${content}`);
}

interface SongStatus {
  song: ExportedSong;
  loaded: LoadedResult;
  outcome: CheckOutcome;
}

async function statusOf(workDir: string, song: ExportedSong): Promise<SongStatus> {
  const loaded = await loadResult(workDir, song.id);
  if (loaded.kind === "missing") return { song, loaded, outcome: { errors: [], warnings: [] } };
  if (loaded.kind === "invalid") return { song, loaded, outcome: { errors: [`invalid result: ${loaded.error}`], warnings: [] } };
  return { song, loaded, outcome: checkResult(song, loaded.result, sourceReader(workDir, song.id)) };
}

async function checkOne(workDir: string, id: string): Promise<void> {
  const { loaded, outcome } = await statusOf(workDir, await loadSong(workDir, id));
  if (loaded.kind === "missing") throw new Error(`No result yet: write ${path.join("results", `${id}.json`)}.`);
  if (loaded.kind === "ok" && loaded.result.status === "ok") {
    console.log(`File: ${finalFileName(loaded.result)} · artist: ${loaded.result.artist}`);
  }
  for (const error of outcome.errors) console.log(`ERROR    ${error}`);
  for (const warning of outcome.warnings) console.log(`WARNING  ${warning}`);
  if (outcome.errors.length > 0) process.exitCode = 1;
  else console.log(outcome.warnings.length > 0 ? "OK, with warnings to review." : "OK");
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");

function describeSide(result: OkResult, side: "pt" | "en"): string {
  const source = result[side];
  if (!source) return "blank";
  const recording = source.title ? `${source.title}${source.artist ? ` (${source.artist})` : ""}` : "file's own translation";
  return `${recording} · ${source.origin === "file" ? "kept from file" : "from the web"}`;
}

function buildReport(
  statuses: SongStatus[],
  groups: MergeGroup[],
  duplicates: ResearchedSong[][],
  unreadable: string[],
): string {
  const done = statuses.filter((status) => status.loaded.kind === "ok");
  const okRows = done.filter((status) => status.loaded.kind === "ok" && status.loaded.result.status === "ok");
  const followUps = done.filter((status) => status.loaded.kind === "ok" && status.loaded.result.status === "followup");
  const withErrors = statuses.filter((status) => status.outcome.errors.length > 0);
  const pending = statuses.filter((status) => status.loaded.kind === "missing");

  const lines = [
    `# Library audit — ${new Date().toISOString().slice(0, 10)}`,
    "",
    `${statuses.length} songs · ${okRows.length} ready · ${followUps.length} follow-ups · ${withErrors.length} with errors · ${pending.length} pending · ${unreadable.length} unreadable`,
    "",
    `## Follow-ups (${followUps.length})`,
    "",
    "| File | Library | Reason | Details | Pages |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const { song, loaded } of followUps) {
    if (loaded.kind !== "ok" || loaded.result.status !== "followup") continue;
    const { reason, details, sources } = loaded.result;
    lines.push(`| ${cell(song.fileName)} | ${cell(song.library)} | ${reason} | ${cell(details)} | ${sources.map((url) => `<${url}>`).join("<br>")} |`);
  }

  lines.push("", `## Errors — fix before apply (${withErrors.length})`, "", "| File | Problems |", "| --- | --- |");
  for (const { song, outcome } of withErrors) lines.push(`| ${cell(song.fileName)} | ${cell(outcome.errors.join("\n"))} |`);

  lines.push("", `## Will be written (${groups.length} files)`, "", "| Now | New file | Artist | Português | English | Warnings |", "| --- | --- | --- | --- | --- | --- |");
  const warningsById = new Map(statuses.map((status) => [status.song.id, status.outcome.warnings]));
  for (const group of groups) {
    const { song, result } = group.primary;
    const now = group.members.map((member) => member.song.fileName).join("<br>");
    const warnings = warningsById.get(song.id) ?? [];
    lines.push(`| ${cell(now)} | ${cell(group.fileName)} | ${cell(result.artist)} | ${cell(describeSide(result, "pt"))} | ${cell(describeSide(result, "en"))} | ${cell(warnings.join("\n"))} |`);
  }

  const merges = groups.filter((group) => group.members.length > 1);
  lines.push("", `## Duplicates merged (${merges.length})`, "");
  for (const group of merges) {
    const others = group.members.filter((member) => member !== group.primary).map((member) => member.song.fileName);
    lines.push(`- **${group.fileName}** (${group.library}): keeps the lyrics of ${group.primary.song.fileName}; replaces ${others.join(", ")}`);
  }

  lines.push("", `## Same song in several files — settle together (${duplicates.length})`, "");
  for (const group of duplicates) {
    const files = group.map(({ song, result }) =>
      result.status === "ok" ? `${song.fileName} → ${finalFileName(result)}` : `${song.fileName} (follow-up: ${result.reason})`,
    );
    lines.push(`- ${group[0].result.original?.title} (${group[0].song.library}): ${files.join("; ")}`);
  }

  if (pending.length > 0) lines.push("", `## Pending (${pending.length})`, "", ...pending.map(({ song }) => `- ${song.id} (${song.fileName})`));
  if (unreadable.length > 0) lines.push("", `## Unreadable (${unreadable.length})`, "", ...unreadable.map((file) => `- ${file}`));
  return `${lines.join("\n")}\n`;
}

async function readUnreadable(workDir: string): Promise<string[]> {
  const filePath = path.join(workDir, "unreadable.json");
  if (!existsSync(filePath)) return [];
  const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
}

async function checkAll(workDir: string, pendingOnly: boolean): Promise<{ statuses: SongStatus[]; groups: MergeGroup[] }> {
  const statuses = await Promise.all((await loadSongs(workDir)).map((song) => statusOf(workDir, song)));
  if (pendingOnly) {
    console.log(JSON.stringify(statuses.filter((status) => status.loaded.kind === "missing").map((status) => status.song.id)));
    return { statuses, groups: [] };
  }

  const ready: CheckedSong[] = [];
  const researched: ResearchedSong[] = [];
  for (const { song, loaded, outcome } of statuses) {
    if (loaded.kind !== "ok") continue;
    researched.push({ song, result: loaded.result });
    if (loaded.result.status === "ok" && outcome.errors.length === 0) ready.push({ song, result: loaded.result });
  }
  const groups = planMergeGroups(ready);
  const reportPath = path.join(workDir, "report.md");
  const report = buildReport(statuses, groups, unmergedDuplicates(researched), await readUnreadable(workDir));
  await fs.writeFile(reportPath, report);
  console.log(`Wrote ${reportPath}`);
  return { statuses, groups };
}

function songFromResult(result: OkResult): Song {
  const sections = result.sections.map((section) => ({
    label: section.label,
    lines: section.lines.map(([pt, en]) => ({ original: pt.trim(), translation: en.trim() })),
  }));
  return createEmptySong({ title: finalTitle(result), artist: result.artist, alignment: buildAlignmentFromAiSections(sections) });
}

async function moveFile(from: string, to: string): Promise<void> {
  await fs.mkdir(path.dirname(to), { recursive: true });
  try {
    await fs.rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fs.copyFile(from, to);
    await fs.rm(from);
  }
}

/** `only`: the song ids to write, after a review asked for some to be redone; empty means all. */
async function apply(workDir: string, confirmed: boolean, only: string[]): Promise<void> {
  const checked = await checkAll(workDir, false);
  const unknown = only.filter((id) => !checked.statuses.some((status) => status.song.id === id));
  if (unknown.length > 0) throw new Error(`No exported song with id: ${unknown.join(", ")}`);
  const inScope = (id: string) => only.length === 0 || only.includes(id);

  const statuses = checked.statuses.filter((status) => inScope(status.song.id));
  const pending = statuses.filter((status) => status.loaded.kind === "missing").length;
  const withErrors = statuses.filter((status) => status.outcome.errors.length > 0).length;
  if (pending > 0 || withErrors > 0) {
    throw new Error(`Not applying: ${pending} songs pending and ${withErrors} with errors (see report.md).`);
  }

  // Writing part of a merged song would leave the other file of it behind as a duplicate.
  const split = checked.groups.filter(
    (group) => group.members.some((member) => inScope(member.song.id)) && !group.members.every((member) => inScope(member.song.id)),
  );
  if (split.length > 0) {
    const ids = split.flatMap((group) => group.members.map((member) => member.song.id));
    throw new Error(`Not applying: --only must name every file of a merged song (${ids.join(", ")}).`);
  }
  const groups = checked.groups.filter((group) => group.members.every((member) => inScope(member.song.id)));

  const sourcePath = (entry: CheckedSong) => path.join(entry.song.libraryPath, entry.song.fileName);
  // A song already written under a new name is gone from its old path: export again before redoing it.
  const gone = groups.flatMap((group) => group.members.map(sourcePath)).filter((source) => !existsSync(source));
  if (gone.length > 0) {
    throw new Error(`Not applying: these files are no longer in the library (already applied?):\n${gone.join("\n")}`);
  }
  const moved = groups.flatMap((group) => group.members.map(sourcePath));
  const isMoved = (target: string) =>
    moved.some((source) => path.dirname(source) === path.dirname(target) && fileNamesMatch(path.basename(source), path.basename(target)));
  // A target taken by a file this run leaves alone (a follow-up) would be overwritten.
  const conflicts = groups
    .map((group) => path.join(group.libraryPath, group.fileName))
    .filter((target) => existsSync(target) && !isMoved(target));
  if (conflicts.length > 0) {
    throw new Error(`Not applying: these files would overwrite songs this run doesn't touch:\n${conflicts.join("\n")}`);
  }

  for (const group of groups) {
    const now = group.members.map((member) => member.song.fileName).join(" + ");
    console.log(`${group.library}: ${now} → ${group.fileName}`);
  }
  if (!confirmed) {
    console.log(`\n${groups.length} files to write, ${moved.length} to replace. Run again with --yes to back up and write them.`);
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const libraries = [...new Map(groups.map((group) => [group.libraryPath, group.library])).entries()];
  for (const [libraryPath, library] of libraries) {
    await fs.cp(libraryPath, path.join(workDir, "backup", stamp, library), { recursive: true });
  }
  // Every old file moves out before any new one is written, so a rename that only changes case,
  // or a new name another song currently has, never overwrites a file still to be moved.
  for (const group of groups) {
    for (const member of group.members) {
      await moveFile(sourcePath(member), path.join(workDir, "replaced", stamp, group.library, member.song.fileName));
    }
  }
  const applied = [];
  for (const group of groups) {
    const target = path.join(group.libraryPath, group.fileName);
    await fs.writeFile(target, await encodeSongAsProFile(songFromResult(group.primary.result)));
    applied.push({ target, from: group.members.map(sourcePath), lyricsFrom: group.primary.song.id });
  }
  await writeJson(path.join(workDir, `applied-${stamp}.json`), applied);
  console.log(`\nWrote ${groups.length} files. Backup: ${path.join(workDir, "backup", stamp)}. Old files: ${path.join(workDir, "replaced", stamp)}.`);
}

async function main(): Promise<void> {
  const [command, workDirArg, ...rest] = process.argv.slice(2);
  if (!command || !workDirArg) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  const workDir = path.resolve(workDirArg);
  await fs.mkdir(workDir, { recursive: true });
  for (const dir of Object.values(dirs(workDir))) await fs.mkdir(dir, { recursive: true });

  const flags = new Set(rest.filter((arg) => arg.startsWith("--")));
  const args = rest.filter((arg) => !arg.startsWith("--"));

  switch (command) {
    case "export":
      return exportLibrary(workDir, args);
    case "search":
      return search(workDir, args.join(" "));
    case "page":
      return savePage(workDir, args[0], args[1], flags.has("--full"));
    case "check":
      if (args[0]) return checkOne(workDir, args[0]);
      await checkAll(workDir, flags.has("--pending"));
      return;
    case "apply": {
      const only = rest.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",").filter(Boolean);
      return apply(workDir, flags.has("--yes"), only ?? []);
    }
    default:
      console.log(USAGE);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
