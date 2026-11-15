import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { userAppDataDir } from "@/lib/desktop/appConfigDir";
import { readMacroMedia } from "./library";
import { parsePathSettingsBase, parseWorkspacePaths } from "./mediaManagerToml";

/** Finds and checks the ProPresenter workspace folder: the one holding `Configuration/Macros`,
 * `Configuration/Props` and `Media/Assets`. */

export const NOT_A_WORKSPACE_MESSAGE =
  "Essa não parece ser a pasta do ProPresenter. Escolha a pasta que tem “Configuration” e “Media” dentro.";

export function macrosFilePath(folder: string): string {
  return path.join(folder, "Configuration", "Macros");
}

export function propsFilePath(folder: string): string {
  return path.join(folder, "Configuration", "Props");
}

export async function isWorkspaceFolder(folder: string): Promise<boolean> {
  try {
    return (await fs.stat(macrosFilePath(folder))).isFile();
  } catch {
    return false;
  }
}

/** Where ProPresenter keeps its support files (`~/Library/Application Support/RenewedVision/ProPresenter`
 * on macOS, `%APPDATA%\RenewedVision\ProPresenter` on Windows). */
function proPresenterSupportDir(): string | null {
  if (process.platform !== "darwin" && process.platform !== "win32") return null;
  return path.join(userAppDataDir(), "RenewedVision", "ProPresenter");
}

async function childDirectories(parentDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(parentDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(parentDir, entry.name));
  } catch {
    return [];
  }
}

export interface DetectedWorkspace {
  folder: string | null;
  hasMacros: boolean;
}

/**
 * The first workspace ProPresenter lists that has macros with media, falling back to the first
 * valid workspace folder found. A null folder leaves the setting for the user to fill.
 */
export async function detectWorkspaceFolder(): Promise<DetectedWorkspace> {
  const supportDir = proPresenterSupportDir();
  if (!supportDir) return { folder: null, hasMacros: false };

  const [listed, pathSettingsBase, localWorkspaces, userWorkspaces] = await Promise.all([
    fs
      .readFile(path.join(supportDir, "media-manager.toml"), "utf-8")
      .then(parseWorkspacePaths)
      .catch(() => []),
    fs
      .readFile(path.join(supportDir, "PathSettings.proPaths"), "utf-8")
      .then(parsePathSettingsBase)
      .catch(() => null),
    childDirectories(path.join(supportDir, "LocalWorkspaces")),
    childDirectories(path.join(supportDir, "UserWorkspaces")),
  ]);

  const home = os.homedir();
  const oneDriveDirs = [process.env.OneDrive, process.env.OneDriveConsumer].filter(
    (dir): dir is string => Boolean(dir?.trim()),
  );

  const candidates = [
    ...listed,
    ...(pathSettingsBase ? [pathSettingsBase] : []),
    path.join(supportDir, "LocalWorkspaces", "ProPresenter"),
    ...localWorkspaces,
    path.join(supportDir, "UserWorkspaces", "ProPresenter"),
    ...userWorkspaces,
    path.join(home, "Documents", "ProPresenter"),
    ...oneDriveDirs.map((dir) => path.join(dir, "Documents", "ProPresenter")),
  ];

  const seen = new Set<string>();
  const valid: string[] = [];
  for (const raw of candidates) {
    const candidate = raw.trim();
    if (!candidate) continue;
    const key = process.platform === "win32" ? candidate.toLowerCase() : candidate;
    if (seen.has(key)) continue;
    seen.add(key);
    if (await isWorkspaceFolder(candidate)) {
      valid.push(candidate);
    }
  }

  for (const candidate of valid) {
    const map = await readMacroMedia(candidate).catch(() => null);
    if (map && map.macros.length > 0) return { folder: candidate, hasMacros: true };
  }
  return { folder: valid[0] ?? null, hasMacros: false };
}
