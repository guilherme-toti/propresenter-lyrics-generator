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
import { createEmptySong, type AlignedLine, type Song } from "@/lib/types";

interface LibraryState {
  songs: Song[];
  activeSongId: string | null;

  createSong: (overrides?: Partial<Song>) => string;
  deleteSong: (id: string) => void;
  renameSong: (id: string, title: string) => void;
  selectSong: (id: string) => void;
  replaceSong: (song: Song) => void;
  updateSong: (id: string, patch: Partial<Song>) => void;

  setLanguageRaw: (id: string, side: "languageA" | "languageB", raw: string) => void;
  realignFromManualText: (id: string) => void;
  applyAiRealignment: (id: string, result: { languageARaw: string; languageBRaw: string; alignment: AlignedLine[] }) => void;

  editRow: (id: string, rowId: string, side: "a" | "b", value: string) => void;
  editSectionLabel: (id: string, rowId: string, label: string) => void;
  addRowAfter: (id: string, rowId: string) => void;
  removeRow: (id: string, rowId: string) => void;
  moveRowInSong: (id: string, rowId: string, direction: "up" | "down") => void;
  toggleRowSectionBreak: (id: string, rowId: string) => void;
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
    (set, get) => ({
      songs: [],
      activeSongId: null,

      createSong: (overrides) => {
        const song = createEmptySong(overrides);
        set((state) => ({ songs: [song, ...state.songs], activeSongId: song.id }));
        return song.id;
      },

      deleteSong: (id) => {
        set((state) => {
          const songs = state.songs.filter((s) => s.id !== id);
          const activeSongId = state.activeSongId === id ? (songs[0]?.id ?? null) : state.activeSongId;
          return { songs, activeSongId };
        });
      },

      renameSong: (id, title) => {
        get().updateSong(id, { title });
      },

      selectSong: (id) => set({ activeSongId: id }),

      replaceSong: (song) => {
        set((state) => ({ songs: state.songs.map((s) => (s.id === song.id ? touch(song) : s)) }));
      },

      updateSong: (id, patch) => {
        set((state) => ({
          songs: state.songs.map((s) => (s.id === id ? touch({ ...s, ...patch }) : s)),
        }));
      },

      setLanguageRaw: (id, side, raw) => {
        set((state) => ({
          songs: state.songs.map((s) => (s.id === id ? touch({ ...s, [side]: raw }) : s)),
        }));
      },

      realignFromManualText: (id) => {
        set((state) => ({
          songs: state.songs.map((s) =>
            s.id === id ? touch({ ...s, alignment: buildAlignmentFromManual(s.languageA, s.languageB) }) : s,
          ),
        }));
      },

      applyAiRealignment: (id, result) => {
        set((state) => ({
          songs: state.songs.map((s) =>
            s.id === id
              ? touch({ ...s, languageA: result.languageARaw, languageB: result.languageBRaw, alignment: result.alignment })
              : s,
          ),
        }));
      },

      editRow: (id, rowId, side, value) => {
        set((state) => ({
          songs: state.songs.map((s) =>
            s.id === id ? touch({ ...s, ...withSyncedRaw(updateRowText(s.alignment, rowId, side, value)) }) : s,
          ),
        }));
      },

      editSectionLabel: (id, rowId, label) => {
        set((state) => ({
          songs: state.songs.map((s) =>
            s.id === id ? touch({ ...s, alignment: updateSectionLabel(s.alignment, rowId, label) }) : s,
          ),
        }));
      },

      addRowAfter: (id, rowId) => {
        set((state) => ({
          songs: state.songs.map((s) =>
            s.id === id ? touch({ ...s, ...withSyncedRaw(insertRowAfter(s.alignment, rowId)) }) : s,
          ),
        }));
      },

      removeRow: (id, rowId) => {
        set((state) => ({
          songs: state.songs.map((s) =>
            s.id === id ? touch({ ...s, ...withSyncedRaw(deleteRow(s.alignment, rowId)) }) : s,
          ),
        }));
      },

      moveRowInSong: (id, rowId, direction) => {
        set((state) => ({
          songs: state.songs.map((s) =>
            s.id === id ? touch({ ...s, ...withSyncedRaw(moveRow(s.alignment, rowId, direction)) }) : s,
          ),
        }));
      },

      toggleRowSectionBreak: (id, rowId) => {
        set((state) => ({
          songs: state.songs.map((s) =>
            s.id === id ? touch({ ...s, ...withSyncedRaw(toggleSectionBreak(s.alignment, rowId)) }) : s,
          ),
        }));
      },
    }),
    { name: "lyrics-studio-library" },
  ),
);
