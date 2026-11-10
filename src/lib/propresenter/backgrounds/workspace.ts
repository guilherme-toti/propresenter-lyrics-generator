import fs from "node:fs/promises";
import path from "node:path";
import { userAppDataDir } from "@/lib/desktop/appConfigDir";
import { parseWorkspacePaths } from "./mediaManagerToml";

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

/** Where ProPresenter keeps its support files. The Windows location follows the macOS one and
 * hasn't been checked on a real Windows install. */
function proPresenterSupportDir(): string | null {
  if (process.platform !== "darwin" && process.platform !== "win32") return null;
  return path.join(userAppDataDir(), "RenewedVision", "ProPresenter");
}

/** The first workspace ProPresenter lists that really is one, falling back to its default
 * location. Null when neither is found, which just leaves the setting for the user to fill. */
export async function detectWorkspaceFolder(): Promise<string | null> {
  const supportDir = proPresenterSupportDir();
  if (!supportDir) return null;

  const listed = await fs
    .readFile(path.join(supportDir, "media-manager.toml"), "utf-8")
    .then(parseWorkspacePaths)
    .catch(() => []);
  const candidates = [...listed, path.join(supportDir, "UserWorkspaces", "ProPresenter")];

  for (const candidate of candidates) {
    if (await isWorkspaceFolder(candidate)) return candidate;
  }
  return null;
}
