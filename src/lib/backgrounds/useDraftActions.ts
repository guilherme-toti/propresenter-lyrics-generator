"use client";

import { useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { errorMessage } from "@/lib/postJson";
import { ACCEPTED_IMAGE_EXTENSIONS, ACCEPTED_VIDEO_EXTENSIONS, planReplacement } from "@/lib/propresenter/backgrounds/media";
import type { BackgroundsOverview, MediaSlot } from "@/lib/propresenter/backgrounds/slots";
import type { TrayFile, TrayRefusal } from "@/lib/propresenter/backgrounds/tray";
import { addTrayFiles, redoBackgroundSlot, replaceBackgroundSlot, trayPreviewUrl, undoBackgroundSlot } from "./api";
import { useBackgroundsDraft } from "./draftStore";
import { encodeStillVideo } from "./stillVideo";
import { toBase64 } from "./stillVideoFrames";

export interface SendProgress {
  done: number;
  total: number;
}

/** An undo or redo running on a screen. */
export type HistoryStep = "undoing" | "redoing";

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

/** A video screen takes images too: they become still videos on the way out. */
function pickerFilterFor(slot: MediaSlot) {
  return slot.mediaType === "video" ? ALL_MEDIA_FILTER : { name: "Imagem", extensions: [...ACCEPTED_IMAGE_EXTENSIONS] };
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

  /** Stages the tray file on the slot. Returns false, with the reason on the screen, when the file
   * can't go there. */
  const stageOn = (slotId: string, trayFileId: string): boolean => {
    const slot = slotById(slotId);
    // Read fresh: a file added a moment ago (picked for this screen) isn't in this render's draft.
    const item = useBackgroundsDraft.getState().tray.find((candidate) => candidate.id === trayFileId);
    if (!slot || !item) return false;

    const plan = planReplacement(slot, item.fileName);
    if (plan.action === "refuse") {
      draft.setNotice(slotId, { tone: "error", message: plan.message });
      return false;
    }
    setSummary(null);
    draft.stage(slotId, trayFileId);
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
      title: slot.mediaType === "video" ? "Escolha o novo vídeo ou imagem" : "Escolha a nova imagem",
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
    const slotIds = Object.keys(useBackgroundsDraft.getState().staged).filter((slotId) => slotById(slotId));
    if (slotIds.length === 0) return;

    let sent = 0;
    const failures: string[] = [];
    setSummary(null);
    setProgress({ done: 0, total: slotIds.length });
    for (const [index, slotId] of slotIds.entries()) {
      const { staged, tray } = useBackgroundsDraft.getState();
      const change = staged[slotId];
      const item = change && tray.find((candidate) => candidate.id === change.trayFileId);
      const slot = slotById(slotId);
      if (item && slot) {
        try {
          // An image onto a video screen becomes a still video here first: the server can't encode.
          const video =
            planReplacement(slot, item.fileName).action === "encode-video"
              ? toBase64(await encodeStillVideo(trayPreviewUrl(item.id)))
              : undefined;
          updateSlot(await replaceBackgroundSlot({ folder, slotId, sourcePath: item.sourcePath, video }));
          draft.markSent(slotId, item.id);
          sent += 1;
        } catch (err) {
          const message = errorMessage(err);
          failures.push(message);
          draft.setNotice(slotId, { tone: "error", message });
        }
      }
      setProgress({ done: index + 1, total: slotIds.length });
    }
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
    if (!folder || stepping.current.has(slotId)) return;
    stepping.current.add(slotId);
    // Whatever the bar said about the last send no longer holds once a screen goes back or forward.
    setSummary(null);
    setHistorySteps((prev) => new Map(prev).set(slotId, step));
    try {
      const request = { folder, slotId };
      updateSlot(await (step === "undoing" ? undoBackgroundSlot(request) : redoBackgroundSlot(request)));
      draft.setNotice(slotId, null);
    } catch (err) {
      draft.setNotice(slotId, { tone: "error", message: errorMessage(err) });
    } finally {
      stepping.current.delete(slotId);
      setHistorySteps((prev) => {
        const next = new Map(prev);
        next.delete(slotId);
        return next;
      });
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
    addFiles,
    pickForTray,
    pickForSlot,
    dropFiles,
    send,
    discard,
    undo: (slotId: string) => stepHistory(slotId, "undoing"),
    redo: (slotId: string) => stepHistory(slotId, "redoing"),
  };
}
