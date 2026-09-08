import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";

export interface PlaylistRef {
  id: string;
  name: string;
}

const playlistRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const persistedDesktopStateSchema = z.object({
  libraryFolder: z.string().nullable().optional(),
  playlistsBaselined: z.boolean().optional(),
  activePlaylist: playlistRefSchema.nullable().optional(),
  knownPlaylistIds: z.array(z.string()).optional(),
  proApiPort: z.number().int().min(1).max(65535).nullable().optional(),
});

interface DesktopState {
  /** ProPresenter Library folder — where exported .pro files are written. */
  libraryFolder: string | null;
  /** Port of ProPresenter's local HTTP API (Preferences → Network). Per-install. */
  proApiPort: number | null;
  /**
   * False right after (re)configuring proApiPort, until the first fetch from
   * ProPresenter completes. That first fetch adopts everything it finds as
   * the known baseline without prompting — only playlists that show up
   * afterwards are "newly created" from the app's point of view.
   */
  playlistsBaselined: boolean;
  activePlaylist: PlaylistRef | null;
  knownPlaylistIds: string[];

  setLibraryFolder: (folder: string | null) => void;
  setProApiPort: (port: number | null) => void;
  setActivePlaylist: (playlist: PlaylistRef | null) => void;
  rememberKnownPlaylists: (ids: string[]) => void;
  markPlaylistsBaselined: () => void;
}

export const useDesktopStore = create<DesktopState>()(
  persist(
    (set) => ({
      libraryFolder: null,
      proApiPort: null,
      playlistsBaselined: false,
      activePlaylist: null,
      knownPlaylistIds: [],

      setLibraryFolder: (folder) => set({ libraryFolder: folder }),

      // A different port means talking to a different ProPresenter, which has its own set
      // of playlists — the previously known baseline no longer applies.
      setProApiPort: (port) => set({ proApiPort: port, playlistsBaselined: false, knownPlaylistIds: [] }),

      setActivePlaylist: (playlist) => set({ activePlaylist: playlist }),

      rememberKnownPlaylists: (ids) =>
        set((state) => ({ knownPlaylistIds: Array.from(new Set([...state.knownPlaylistIds, ...ids])) })),

      markPlaylistsBaselined: () => set({ playlistsBaselined: true }),
    }),
    {
      name: "lyrics-studio-desktop",
      version: 0,
      migrate: (persistedState) => {
        const parsed = persistedDesktopStateSchema.safeParse(persistedState);
        return parsed.success ? parsed.data : {};
      },
    },
  ),
);
