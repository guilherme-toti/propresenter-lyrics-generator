import { create } from "zustand";
import type { TrayFile } from "@/lib/propresenter/backgrounds/tray";

/**
 * The Backgrounds screen's draft: files waiting in the tray and the changes staged on each screen.
 * Nothing here reaches ProPresenter until "Enviar". Kept in memory only, outside the screen, so
 * going to another page and back keeps the draft, while restarting the app starts clean (the
 * server forgets the tray's preview ids then too).
 */

export interface StagedChange {
  trayFileId: string;
}

/** Shown on a screen until its next change: the outcome of sending it, or why a file can't go there. */
export type ScreenNotice = { tone: "sent" } | { tone: "error"; message: string };

interface DraftState {
  tray: TrayFile[];
  /** The tray file picked by clicking, waiting for a click on the screen it goes to. */
  selectedTrayFileId: string | null;
  /** By slot id. */
  staged: Record<string, StagedChange>;
  /** By slot id. */
  notices: Record<string, ScreenNotice>;
  /** A file already in the tray keeps its place (and id) rather than showing twice. */
  addToTray: (items: TrayFile[]) => void;
  /** Also takes back every change that would have used the file. */
  removeFromTray: (trayFileId: string) => void;
  selectTrayFile: (trayFileId: string | null) => void;
  stage: (slotId: string, trayFileId: string) => void;
  unstage: (slotId: string) => void;
  discardStaged: () => void;
  /** A change that went out: the screen says it was sent, and it's no longer staged unless a
   * different file was staged on it meanwhile. */
  markSent: (slotId: string, trayFileId: string) => void;
  setNotice: (slotId: string, notice: ScreenNotice | null) => void;
}

function without<T>(record: Record<string, T>, keep: (key: string, value: T) => boolean): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => keep(key, value)));
}

export const useBackgroundsDraft = create<DraftState>()((set) => ({
  tray: [],
  selectedTrayFileId: null,
  staged: {},
  notices: {},

  addToTray: (items) =>
    set((state) => {
      const known = new Set(state.tray.map((item) => item.sourcePath));
      const added = items.filter((item) => {
        if (known.has(item.sourcePath)) return false;
        known.add(item.sourcePath);
        return true;
      });
      return { tray: [...state.tray, ...added] };
    }),

  removeFromTray: (trayFileId) =>
    set((state) => ({
      tray: state.tray.filter((item) => item.id !== trayFileId),
      selectedTrayFileId: state.selectedTrayFileId === trayFileId ? null : state.selectedTrayFileId,
      staged: without(state.staged, (_, change) => change.trayFileId !== trayFileId),
    })),

  selectTrayFile: (trayFileId) => set({ selectedTrayFileId: trayFileId }),

  stage: (slotId, trayFileId) =>
    set((state) => ({
      staged: { ...state.staged, [slotId]: { trayFileId } },
      notices: without(state.notices, (key) => key !== slotId),
      selectedTrayFileId: null,
    })),

  unstage: (slotId) => set((state) => ({ staged: without(state.staged, (key) => key !== slotId) })),

  discardStaged: () => set({ staged: {} }),

  markSent: (slotId, trayFileId) =>
    set((state) => ({
      // A newer file staged on the slot meanwhile stays staged.
      staged: without(state.staged, (key, change) => key !== slotId || change.trayFileId !== trayFileId),
      notices: { ...state.notices, [slotId]: { tone: "sent" } },
    })),

  setNotice: (slotId, notice) =>
    set((state) => ({
      notices: notice ? { ...state.notices, [slotId]: notice } : without(state.notices, (key) => key !== slotId),
    })),
}));
