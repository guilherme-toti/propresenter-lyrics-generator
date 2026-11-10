"use client";

import { useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { errorMessage } from "@/lib/postJson";
import { ACCEPTED_IMAGE_EXTENSIONS, ACCEPTED_VIDEO_EXTENSIONS, planReplacement } from "@/lib/propresenter/backgrounds/media";
import type { BackgroundsOverview, MediaSlot } from "@/lib/propresenter/backgrounds/slots";
import type { TrayFile, TrayRefusal } from "@/lib/propresenter/backgrounds/tray";
import { addTrayFiles, redoBackgroundSlot, replaceBackgroundSlot, undoBackgroundSlot } from "./api";
import { useBackgroundsDraft } from "./draftStore";
import { useDesktopStore } from "@/lib/desktopStore";
import { activeLinks, followersOf, historyGroup, type HistoryStep } from "./links";

export interface SendProgress {
  done: number;
  total: number;
}

/** An undo or redo running on a screen. */

export interface SendSummary {
  sent: number;
  /** One per change that didn't go out, with the reason, so the bar can say why even when its
   * screen is gone (a macro that stopped showing the file). */
  failures: string[];
}

/** The tray route takes at most this many paths per request. */
const TRAY_BATCH_SIZE = 50;

const ALL_MEDIA_FILTER = {
  name: "Imagens e vídeos",
  extensions: [...ACCEPTED_IMAGE_EXTENSIONS, ...ACCEPTED_VIDEO_EXTENSIONS],
};

function pickerFilterFor(slot: MediaSlot) {
  return slot.mediaType === "video"
    ? { name: "Vídeo MP4", extensions: [...ACCEPTED_VIDEO_EXTENSIONS] }
    : { name: "Imagem", extensions: [...ACCEPTED_IMAGE_EXTENSIONS] };
}

interface OverviewHandle {
  overview: BackgroundsOverview | null;
  reload: () => void;
  updateSlot: (slot: MediaSlot) => void;
}

/**
 * What the Backgrounds screen does with its draft: bringing files into the tray, staging them on
 * screens, sending the staged changes to ProPresenter, and undoing or redoing a sent one.
 */
export function useDraftActions(folder: string | null, { overview, reload, updateSlot }: OverviewHandle) {
  const draft = useBackgroundsDraft();
  const [trayRefusals, setTrayRefusals] = useState<TrayRefusal[]>([]);
  const [trayError, setTrayError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const [summary, setSummary] = useState<SendSummary | null>(null);
  const [historySteps, setHistorySteps] = useState<ReadonlyMap<string, HistoryStep>>(new Map());

  const slotById = (slotId: string) => overview?.slots.find((slot) => slot.id === slotId) ?? null;

  /** Adds the files to the tray and returns their tray files, in the order given. A file that was
   * already there comes back as the one it already had. */
  const addFiles = async (paths: string[]): Promise<TrayFile[]> => {
    setTrayError(null);
    const files: TrayFile[] = [];
    const refused: TrayRefusal[] = [];
    try {
      for (let start = 0; start < paths.length; start += TRAY_BATCH_SIZE) {
        const batch = await addTrayFiles({ paths: paths.slice(start, start + TRAY_BATCH_SIZE) });
        files.push(...batch.files);
        refused.push(...batch.refused);
      }
    } catch (err) {
      setTrayError(errorMessage(err));
    }
    setTrayRefusals(refused);
    draft.addToTray(files);
    const { tray } = useBackgroundsDraft.getState();
    return files.flatMap((file) => tray.find((item) => item.sourcePath === file.sourcePath) ?? []);
  };

  /** Stages the tray file on the slot and on the screens that follow it. Returns false, with the reason on the
   * screen, when the file can't go there. */
  const stageOn = (slotId: string, trayFileId: string): boolean => {
    const slot = slotById(slotId);
    // Read fresh: a file added a moment ago (picked for this screen) isn't in this render's draft.
    const item = useBackgroundsDraft.getState().tray.find((candidate) => candidate.id === trayFileId);
    if (!slot || !item || !overview) return false;

    const plan = planReplacement(slot, item.fileName);
    if (plan.action === "refuse") {
      draft.setNotice(slotId, { tone: "error", message: plan.message });
      return false;
    }
    // A follower that can't take the file (a different format) just keeps its own.
    const links = activeLinks(useDesktopStore.getState().backgroundLinks, overview.slots);
    const followers = followersOf(slotId, links).filter((followerId) => {
      const follower = slotById(followerId);
      return follower !== null && planReplacement(follower, item.fileName).action !== "refuse";
    });
    setSummary(null);
    draft.stage([slotId, ...followers], trayFileId);
    return true;
  };

  const pickForTray = async () => {
    const picked = await open({ multiple: true, directory: false, title: "Escolha os arquivos", filters: [ALL_MEDIA_FILTER] });
    if (picked && picked.length > 0) await addFiles(picked);
  };

  /** A click on a screen with nothing picked in the tray: choose its new file right away. */
  const pickForSlot = async (slotId: string) => {
    const slot = slotById(slotId);
    if (!slot) return;
    const picked = await open({
      multiple: false,
      directory: false,
      title: slot.mediaType === "video" ? "Escolha o novo vídeo" : "Escolha a nova imagem",
      filters: [pickerFilterFor(slot)],
    });
    if (typeof picked !== "string") return;
    const [item] = await addFiles([picked]);
    if (item) stageOn(slotId, item.id);
  };

  /** Files dropped from Finder or Explorer: all go to the tray, and the first one that fits goes
   * on the screen they were dropped on. */
  const dropFiles = async (paths: string[], slotId: string | null) => {
    const items = await addFiles(paths);
    if (!slotId || items.length === 0) return;
    const slot = slotById(slotId);
    const fitting = slot ? items.find((item) => planReplacement(slot, item.fileName).action !== "refuse") : undefined;
    stageOn(slotId, (fitting ?? items[0]).id);
  };

  /**
   * One file at a time, so a failure says which screen it was, and the rest still go out. Each
   * change is read again right before it goes: a big video can take a while, and meanwhile the
   * user may have staged another file on a screen still waiting, or taken one back.
   */
  const send = async () => {
    if (!folder || progress) return;
    const stagedAtStart = useBackgroundsDraft.getState().staged;
    const slotIds = Object.keys(stagedAtStart).filter((slotId) => slotById(slotId));
    if (slotIds.length === 0) return;
    // Read before anything goes out: sending a slot unties the followers staged along with it.
    const leaderOf = new Map(slotIds.map((slotId) => [slotId, stagedAtStart[slotId].followsSlotId ?? slotId]));
    const sentByLeader = new Map<string, string[]>();

    let sent = 0;
    const failures: string[] = [];
    setSummary(null);
    setProgress({ done: 0, total: slotIds.length });
    for (const [index, slotId] of slotIds.entries()) {
      const { staged, tray } = useBackgroundsDraft.getState();
      const change = staged[slotId];
      const item = change && tray.find((candidate) => candidate.id === change.trayFileId);
      if (item) {
        try {
          updateSlot(await replaceBackgroundSlot({ folder, slotId, sourcePath: item.sourcePath }));
          draft.markSent(slotId, item.id);
          const leader = leaderOf.get(slotId) ?? slotId;
          sentByLeader.set(leader, [...(sentByLeader.get(leader) ?? []), slotId]);
          sent += 1;
        } catch (err) {
          const message = errorMessage(err);
          failures.push(message);
          draft.setNotice(slotId, { tone: "error", message });
        }
      }
      setProgress({ done: index + 1, total: slotIds.length });
    }
    for (const group of sentByLeader.values()) draft.rememberSentTogether(group);
    setProgress(null);
    setSummary({ sent, failures });
    reload();
  };

  const discard = () => {
    draft.discardStaged();
    setSummary(null);
  };

  /** One undo or redo at a time per screen; the other screens stay free. Checked through a ref
   * too: a quick double-click lands before the re-render that would disable the button. */
  const stepping = useRef(new Set<string>());
  const stepHistory = async (slotId: string, step: HistoryStep) => {
    if (!folder || !overview) return;
    const { sentTogether, undoneTogether } = useBackgroundsDraft.getState();
    const slotIds = historyGroup(slotId, step, overview.slots, { sent: sentTogether, undone: undoneTogether });
    if (slotIds.some((id) => stepping.current.has(id))) return;
    for (const id of slotIds) stepping.current.add(id);
    if (step === "undoing") draft.rememberUndoneTogether(slotIds);
    // Whatever the bar said about the last send no longer holds once a screen goes back or forward.
    setSummary(null);
    setHistorySteps((prev) => {
      const next = new Map(prev);
      for (const id of slotIds) next.set(id, step);
      return next;
    });
    // One at a time, like a send, so a failure is shown on the screen it happened to.
    for (const id of slotIds) {
      try {
        const request = { folder, slotId: id };
        updateSlot(await (step === "undoing" ? undoBackgroundSlot(request) : redoBackgroundSlot(request)));
        draft.setNotice(id, null);
      } catch (err) {
        draft.setNotice(id, { tone: "error", message: errorMessage(err) });
      } finally {
        stepping.current.delete(id);
        setHistorySteps((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }
    }
    reload();
  };

  return {
    trayRefusals,
    trayError,
    dismissTrayMessages: () => {
      setTrayRefusals([]);
      setTrayError(null);
    },
    progress,
    summary,
    dismissSummary: () => setSummary(null),
    historySteps,
    stageOn,
    pickForTray,
    pickForSlot,
    dropFiles,
    send,
    discard,
    undo: (slotId: string) => stepHistory(slotId, "undoing"),
    redo: (slotId: string) => stepHistory(slotId, "redoing"),
  };
}
