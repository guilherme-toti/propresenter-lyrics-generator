import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  alignmentToRaw,
  buildAlignmentFromManual,
  deleteRow,
  insertRowAfter,
  moveRow,
  toggleSectionBreak,
  updateRowText,
  updateSectionLabel,
} from "@/lib/alignment";
import { createEmptySong, type AlignedLine, type Song, type SideAttribution, type SideSource } from "@/lib/types";
import { storedSongSchema } from "@/lib/songSchema";

interface LibraryState {
  song: Song | null;

  startSong: (overrides?: Partial<Song>) => void;
  updateSong: (patch: Partial<Song>) => void;

  setLanguageRaw: (side: "languageA" | "languageB", raw: string) => void;
  /** Swaps one side's raw lyrics for a different catalogue recording's — alignment is left as-is
   * for the user to redo (see LyricsEditors' "Alinhar letra"/"Realinhar com IA"). */
  replaceSide: (side: "languageA" | "languageB", raw: string, source: SideSource, attribution: SideAttribution) => void;
  realignFromManualText: () => void;
  applyAiRealignment: (result: { languageARaw: string; languageBRaw: string; alignment: AlignedLine[] }) => void;

  editRow: (rowId: string, side: "a" | "b", value: string) => void;
  editSectionLabel: (rowId: string, label: string) => void;
  addRowAfter: (rowId: string) => void;
  removeRow: (rowId: string) => void;
  moveRowInSong: (rowId: string, direction: "up" | "down") => void;
  toggleRowSectionBreak: (rowId: string) => void;
}

function touch(song: Song): Song {
  return { ...song, updatedAt: Date.now() };
}

/**
 * Keeps the raw editor text in sync whenever the alignment is edited directly (text, reordering,
 * inserted/removed rows, section splits), so the textareas never drift out of sync with what's
 * shown in the alignment preview.
 */
function withSyncedRaw(alignment: AlignedLine[]): Pick<Song, "alignment" | "languageA" | "languageB"> {
  return {
    alignment,
    languageA: alignmentToRaw(alignment, "a"),
    languageB: alignmentToRaw(alignment, "b"),
  };
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => ({
      song: null,

      startSong: (overrides) => set({ song: createEmptySong(overrides) }),

      updateSong: (patch) => {
        set((state) => (state.song ? { song: touch({ ...state.song, ...patch }) } : state));
      },

      setLanguageRaw: (side, raw) => {
        set((state) => (state.song ? { song: touch({ ...state.song, [side]: raw }) } : state));
      },

      replaceSide: (side, raw, source, attribution) => {
        set((state) => {
          if (!state.song) return state;
          const sourceKey = side === "languageA" ? "sourceA" : "sourceB";
          const attributionKey = side === "languageA" ? "attributionA" : "attributionB";
          return { song: touch({ ...state.song, [side]: raw, [sourceKey]: source, [attributionKey]: attribution }) };
        });
      },

      realignFromManualText: () => {
        set((state) =>
          state.song
            ? { song: touch({ ...state.song, alignment: buildAlignmentFromManual(state.song.languageA, state.song.languageB) }) }
            : state,
        );
      },

      applyAiRealignment: (result) => {
        set((state) =>
          state.song
            ? {
                song: touch({
                  ...state.song,
                  languageA: result.languageARaw,
                  languageB: result.languageBRaw,
                  alignment: result.alignment,
                }),
              }
            : state,
        );
      },

      editRow: (rowId, side, value) => {
        set((state) =>
          state.song
            ? { song: touch({ ...state.song, ...withSyncedRaw(updateRowText(state.song.alignment, rowId, side, value)) }) }
            : state,
        );
      },

      editSectionLabel: (rowId, label) => {
        set((state) =>
          state.song ? { song: touch({ ...state.song, alignment: updateSectionLabel(state.song.alignment, rowId, label) }) } : state,
        );
      },

      addRowAfter: (rowId) => {
        set((state) =>
          state.song ? { song: touch({ ...state.song, ...withSyncedRaw(insertRowAfter(state.song.alignment, rowId)) }) } : state,
        );
      },

      removeRow: (rowId) => {
        set((state) =>
          state.song ? { song: touch({ ...state.song, ...withSyncedRaw(deleteRow(state.song.alignment, rowId)) }) } : state,
        );
      },

      moveRowInSong: (rowId, direction) => {
        set((state) =>
          state.song
            ? { song: touch({ ...state.song, ...withSyncedRaw(moveRow(state.song.alignment, rowId, direction)) }) }
            : state,
        );
      },

      toggleRowSectionBreak: (rowId) => {
        set((state) =>
          state.song
            ? { song: touch({ ...state.song, ...withSyncedRaw(toggleSectionBreak(state.song.alignment, rowId)) }) }
            : state,
        );
      },
    }),
    {
      name: "lyrics-studio-library",
      version: 1,
      // Bumped from the old {songs: Song[], activeSongId} shape — the app now only ever holds one
      // active song, so there's nothing sensible to carry forward from a saved list. Anything
      // persisted under the old version is discarded; the song is re-validated rather than trusted
      // as-is, so a stale/malformed entry falls back to null instead of crashing the app on render.
      migrate: (persistedState, version) => {
        if (version < 1) return { song: null };
        const candidate = persistedState as { song?: unknown } | undefined;
        const parsed = storedSongSchema.safeParse(candidate?.song);
        return { song: parsed.success ? (parsed.data as Song) : null };
      },
    },
  ),
);
