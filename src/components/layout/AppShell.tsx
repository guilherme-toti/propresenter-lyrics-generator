"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { NewSongDialog } from "@/components/studio/NewSongDialog";
import { PlaylistPickerModal } from "@/components/settings/PlaylistPickerModal";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useHasMounted } from "@/lib/useHasMounted";
import { isDesktopApp } from "@/lib/tauri/env";
import { useDesktopStore } from "@/lib/desktopStore";
import { useLibraryStore } from "@/lib/store";
import { usePlaylistWatcher } from "@/lib/desktop/usePlaylistWatcher";
import { useValidateActivePlaylist } from "@/lib/desktop/useValidateActivePlaylist";

const SONGS_PATH = "/";
const BACKGROUNDS_PATH = "/backgrounds";
const SETTINGS_PATH = "/settings";

interface AppShellActions {
  openNewSong: () => void;
  openSettings: () => void;
}

const AppShellContext = createContext<AppShellActions | null>(null);

/** What the shell opens — the search dialog, the Ajustes screen — for screens that lead there (an
 * empty state's "Abrir Ajustes"). */
export function useAppShellActions(): AppShellActions {
  const actions = useContext(AppShellContext);
  if (!actions) throw new Error("useAppShellActions must be used inside AppShell.");
  return actions;
}

/** Wraps every screen (see app/layout.tsx), so the header and dialogs stay mounted while the user
 * moves between screens: a dialog opened on one screen survives the navigation to another. */
export function AppShell({ children }: { children: ReactNode }) {
  // Zustand's persisted store only reflects localStorage after the client mounts; rendering the
  // real UI before then would make the first client render diverge from the server-rendered HTML.
  const mounted = useHasMounted();
  const pathname = usePathname();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { discovered, confirm } = usePlaylistWatcher();
  const { missing: missingPlaylist, dismiss: dismissMissingPlaylist } = useValidateActivePlaylist();
  const proApiPort = useDesktopStore((s) => s.proApiPort);
  const setActivePlaylist = useDesktopStore((s) => s.setActivePlaylist);
  const goHome = useLibraryStore((s) => s.goHome);

  const onSongsScreen = pathname === SONGS_PATH;

  // A picked or new song opens on the songs screen, so searching from another screen goes there
  // first; the dialog opens over it.
  const openNewSongDialog = () => {
    if (!onSongsScreen) router.push(SONGS_PATH);
    setDialogOpen(true);
  };

  // On the songs screen Home clears the current song (see goHome). From any other screen it only
  // leads back, so a song in progress is still there when the user returns.
  const handleHome = () => {
    if (onSongsScreen) goHome();
    else router.push(SONGS_PATH);
  };

  const actions: AppShellActions = { openNewSong: openNewSongDialog, openSettings: () => router.push(SETTINGS_PATH) };

  if (!mounted) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <Header onNewSong={openNewSongDialog} onGoHome={handleHome} homeActive={onSongsScreen} />
        <div className="flex flex-1" />
      </div>
    );
  }

  const desktop = isDesktopApp();

  return (
    <AppShellContext.Provider value={actions}>
      <div className="flex h-screen flex-col overflow-hidden">
        <Header
          onNewSong={openNewSongDialog}
          onGoHome={handleHome}
          homeActive={onSongsScreen}
          showTitle={!desktop}
          settings={desktop ? { href: SETTINGS_PATH, active: pathname === SETTINGS_PATH } : undefined}
          backgrounds={desktop ? { href: BACKGROUNDS_PATH, active: pathname === BACKGROUNDS_PATH } : undefined}
        />
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <NewSongDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
        {desktop && (
          <Modal open={discovered !== null} onClose={() => confirm(false)} title="Nova playlist encontrada">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-ink">
                Uma nova playlist foi encontrada: <strong>&quot;{discovered?.name}&quot;</strong>. Usar ela como
                destino para as próximas exportações?
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => confirm(false)}>
                  Agora não
                </Button>
                <Button variant="primary" size="sm" onClick={() => confirm(true)}>
                  Usar esta
                </Button>
              </div>
            </div>
          </Modal>
        )}
        {desktop && (
          <PlaylistPickerModal
            open={missingPlaylist}
            port={proApiPort}
            onClose={dismissMissingPlaylist}
            onSelect={setActivePlaylist}
            title="A playlist selecionada não foi encontrada"
            description="Ela pode ter sido renomeada ou apagada no ProPresenter. Escolha outra, ou crie uma nova por lá e feche este aviso pra tentar de novo mais tarde."
          />
        )}
      </div>
    </AppShellContext.Provider>
  );
}
