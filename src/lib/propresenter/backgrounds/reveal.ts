import { execFile } from "node:child_process";
import type { FileManager } from "./contracts";

/** Opens the system's file manager with the file selected, so it can be dragged into
 * ProPresenter. Best effort: whatever asked for it still works without it. */
export function revealInFileManager(filePath: string): Promise<FileManager | null> {
  return new Promise((resolve) => {
    if (process.platform === "darwin") {
      execFile("open", ["-R", filePath], (err) => {
        if (err) console.warn("backgrounds: could not show the file in Finder", err);
        resolve(err ? null : "finder");
      });
    } else if (process.platform === "win32") {
      // Explorer exits with 1 even when the window opened, so its result says nothing. It parses
      // its own arguments and wants the path quoted inside this one, hence the verbatim flag.
      // Not yet checked on a real Windows install.
      execFile("explorer.exe", [`/select,"${filePath}"`], { windowsVerbatimArguments: true }, () => resolve("explorer"));
    } else {
      resolve(null);
    }
  });
}
