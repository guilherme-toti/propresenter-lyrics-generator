import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PlaylistRef {
  id: string;
  name: string;
  sourceFile: string;
}

interface DesktopState {
  /** ProPresenter Library folder — where exported .pro files are written. */
  libraryFolder: string | null;
  /** ProPresenter Playlists folder — watched to detect newly created playlists. */
  playlistsFolder: string | null;
  /**
   * False right after (re)configuring playlistsFolder, until the first scan
   * completes. That first scan adopts everything it finds as the known
   * baseline without prompting — only playlists that show up afterwards are
   * "newly created" from the app's point of view.
   */
  playlistsBaselined: boolean;
  activePlaylist: PlaylistRef | null;
  knownPlaylistIds: string[];

  setLibraryFolder: (folder: string | null) => void;
  setPlaylistsFolder: (folder: string | null) => void;
  setActivePlaylist: (playlist: PlaylistRef | null) => void;
  rememberKnownPlaylists: (ids: string[]) => void;
  markPlaylistsBaselined: () => void;
}

export const useDesktopStore = create<DesktopState>()(
  persist(
    (set) => ({
      libraryFolder: null,
      playlistsFolder: null,
      playlistsBaselined: false,
      activePlaylist: null,
      knownPlaylistIds: [],

      setLibraryFolder: (folder) => set({ libraryFolder: folder }),

      setPlaylistsFolder: (folder) =>
        set({ playlistsFolder: folder, playlistsBaselined: false, knownPlaylistIds: [] }),

      setActivePlaylist: (playlist) => set({ activePlaylist: playlist }),

      rememberKnownPlaylists: (ids) =>
        set((state) => ({ knownPlaylistIds: Array.from(new Set([...state.knownPlaylistIds, ...ids])) })),

      markPlaylistsBaselined: () => set({ playlistsBaselined: true }),
    }),
    { name: "lyrics-studio-desktop" },
  ),
);
