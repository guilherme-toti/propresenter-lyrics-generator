import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { portSchema } from "@/lib/desktop/parsePort";
import { playlistRefSchema, type PlaylistRef } from "@/lib/propresenter/contracts";

const persistedDesktopStateSchema = z.object({
  libraryFolder: z.string().nullable().optional(),
  proPresenterFolder: z.string().nullable().optional(),
  playlistsBaselined: z.boolean().optional(),
  activePlaylist: playlistRefSchema.nullable().optional(),
  knownPlaylistIds: z.array(z.string()).optional(),
  proApiPort: portSchema.nullable().optional(),
  backgroundLinks: z.record(z.string(), z.string()).optional(),
});

interface DesktopState {
  /** ProPresenter Library folder — where exported .pro files are written. */
  libraryFolder: string | null;
  /** ProPresenter's workspace folder (holds Configuration/Macros and Media/Assets) — what the
   * Backgrounds screen reads macros from. */
  proPresenterFolder: string | null;
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
  /** Backgrounds screens linked by the user, as follower slot id → the slot it follows: a file
   * staged on the followed screen is staged on its followers too ("Palavra Bíblia segue
   * Palavra"). Slot ids come from file paths, so links belong to this computer's workspace. */
  backgroundLinks: Record<string, string>;

  setLibraryFolder: (folder: string | null) => void;
  setProPresenterFolder: (folder: string | null) => void;
  setProApiPort: (port: number | null) => void;
  setActivePlaylist: (playlist: PlaylistRef | null) => void;
  rememberKnownPlaylists: (ids: string[]) => void;
  markPlaylistsBaselined: () => void;
  /** Null unlinks the follower. */
  setBackgroundLink: (followerSlotId: string, leaderSlotId: string | null) => void;
}

export const useDesktopStore = create<DesktopState>()(
  persist(
    (set) => ({
      libraryFolder: null,
      proPresenterFolder: null,
      proApiPort: null,
      playlistsBaselined: false,
      activePlaylist: null,
      knownPlaylistIds: [],
      backgroundLinks: {},

      setLibraryFolder: (folder) => set({ libraryFolder: folder }),

      setProPresenterFolder: (folder) => set({ proPresenterFolder: folder }),

      // A different port means talking to a different ProPresenter, which has its own set
      // of playlists — the previously known baseline no longer applies.
      setProApiPort: (port) => set({ proApiPort: port, playlistsBaselined: false, knownPlaylistIds: [] }),

      setActivePlaylist: (playlist) => set({ activePlaylist: playlist }),

      rememberKnownPlaylists: (ids) =>
        set((state) => ({ knownPlaylistIds: Array.from(new Set([...state.knownPlaylistIds, ...ids])) })),

      markPlaylistsBaselined: () => set({ playlistsBaselined: true }),

      setBackgroundLink: (followerSlotId, leaderSlotId) =>
        set((state) => {
          const others = Object.fromEntries(
            Object.entries(state.backgroundLinks).filter(([follower]) => follower !== followerSlotId),
          );
          return { backgroundLinks: leaderSlotId ? { ...others, [followerSlotId]: leaderSlotId } : others };
        }),
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
