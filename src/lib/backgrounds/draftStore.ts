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
  /** Set on a follower staged along with the slot it follows, so taking back that slot's change
   * takes back this one too. Null for the slot the file was dropped on. */
  followsSlotId: string | null;
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
  /** By slot id: the slots its last send went out with (it and the followers staged along with it).
   * "Desfazer" takes back exactly these. Identical files alone aren't enough: the same video put on
   * three screens one by one shouldn't make one undo take back all three. */
  sentTogether: Record<string, string[]>;
  /** By slot id: the slots undone together with it, which "Refazer" brings back together. */
  undoneTogether: Record<string, string[]>;
  /** A file already in the tray keeps its place (and id) rather than showing twice. */
  addToTray: (items: TrayFile[]) => void;
  /** Also takes back every change that would have used the file. */
  removeFromTray: (trayFileId: string) => void;
  selectTrayFile: (trayFileId: string | null) => void;
  /** `slotIds[0]` is where the file was dropped; the rest are the screens that follow it. */
  stage: (slotIds: string[], trayFileId: string) => void;
  /** Takes back this slot's change and the changes its followers got along with it. */
  unstage: (slotId: string) => void;
  discardStaged: () => void;
  /** A change that went out: the screen says it was sent, and it's no longer staged unless a
   * different file was staged on it meanwhile. Its followers' changes stand on their own from now on,
   * so one that failed stays put whatever happens to this slot next. */
  markSent: (slotId: string, trayFileId: string) => void;
  setNotice: (slotId: string, notice: ScreenNotice | null) => void;
  rememberSentTogether: (slotIds: string[]) => void;
  rememberUndoneTogether: (slotIds: string[]) => void;
}

function without<T>(record: Record<string, T>, keep: (key: string, value: T) => boolean): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => keep(key, value)));
}

/** Puts `slotIds` in a group of their own, taking them out of any group they were in before, so a
 * slot sent (or undone) on its own later no longer drags its old partners along. */
function regroup(groups: Record<string, string[]>, slotIds: string[]): Record<string, string[]> {
  const moved = new Set(slotIds);
  const next: Record<string, string[]> = {};
  for (const [slotId, group] of Object.entries(groups)) {
    if (!moved.has(slotId)) next[slotId] = group.filter((id) => !moved.has(id));
  }
  for (const slotId of slotIds) next[slotId] = slotIds;
  return next;
}

export const useBackgroundsDraft = create<DraftState>()((set) => ({
  tray: [],
  selectedTrayFileId: null,
  staged: {},
  notices: {},
  sentTogether: {},
  undoneTogether: {},

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

  stage: ([droppedOn, ...followers], trayFileId) =>
    set((state) => {
      const touched = new Set([droppedOn, ...followers]);
      // Followers these slots pulled along earlier, but that aren't in the new group, only had a
      // change because of them.
      const staged = without(
        state.staged,
        (slotId, change) => touched.has(slotId) || change.followsSlotId === null || !touched.has(change.followsSlotId),
      );
      staged[droppedOn] = { trayFileId, followsSlotId: null };
      for (const slotId of followers) staged[slotId] = { trayFileId, followsSlotId: droppedOn };
      return { staged, notices: without(state.notices, (slotId) => !touched.has(slotId)), selectedTrayFileId: null };
    }),

  unstage: (slotId) =>
    set((state) => ({
      staged: without(state.staged, (key, change) => key !== slotId && change.followsSlotId !== slotId),
    })),

  discardStaged: () => set({ staged: {} }),

  markSent: (slotId, trayFileId) =>
    set((state) => {
      // A newer file staged on the slot meanwhile keeps it, and its followers stay tied to it.
      const removed = state.staged[slotId]?.trayFileId === trayFileId;
      const staged: Record<string, StagedChange> = {};
      for (const [key, change] of Object.entries(state.staged)) {
        if (removed && key === slotId) continue;
        staged[key] = removed && change.followsSlotId === slotId ? { ...change, followsSlotId: null } : change;
      }
      return {
        staged,
        notices: { ...state.notices, [slotId]: { tone: "sent" } },
        // A send starts the slot's history over, so it has nothing left to redo with the others.
        undoneTogether: without(state.undoneTogether, (key) => key !== slotId),
      };
    }),

  rememberSentTogether: (slotIds) => set((state) => ({ sentTogether: regroup(state.sentTogether, slotIds) })),

  rememberUndoneTogether: (slotIds) => set((state) => ({ undoneTogether: regroup(state.undoneTogether, slotIds) })),

  setNotice: (slotId, notice) =>
    set((state) => ({
      notices: notice ? { ...state.notices, [slotId]: notice } : without(state.notices, (key) => key !== slotId),
    })),
}));
