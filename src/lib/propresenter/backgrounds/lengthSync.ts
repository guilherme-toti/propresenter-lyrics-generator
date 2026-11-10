import { readMacroMedia } from "./library";
import { caughtUp, mp4DurationSeconds } from "./mp4Duration";

/**
 * ProPresenter re-reads a replaced video's length by itself, a few seconds after the file changes
 * (about 4–7 s on ProPresenter 21.4), and until then stops a longer video at the old length. A macro
 * run right after a swap would loop early, so "Testar" waits for ProPresenter to catch up first.
 */

/** Past this, the macro runs anyway rather than leave "Testar" spinning. */
const WAIT_LIMIT_MS = 12_000;
const CHECK_EVERY_MS = 500;

async function macroCaughtUp(folder: string, macroUuid: string): Promise<boolean> {
  const { slots, videoLengths } = await readMacroMedia(folder);
  const checks = Object.entries(videoLengths[macroUuid] ?? {}).map(async ([slotId, storedSeconds]) => {
    const slot = slots.find((candidate) => candidate.id === slotId);
    return !slot || caughtUp(await mp4DurationSeconds(slot.filePath), storedSeconds);
  });
  return (await Promise.all(checks)).every(Boolean);
}

/** Resolves once ProPresenter has every video of the macro at its file's length, or at the limit.
 * Never throws: not being able to tell is no reason to keep the macro from running. */
export async function waitForVideoLengths(folder: string, macroUuid: string): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  try {
    while (!(await macroCaughtUp(folder, macroUuid)) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, CHECK_EVERY_MS));
    }
  } catch (err) {
    console.warn("backgrounds: could not compare video lengths before running a macro", err);
  }
}
