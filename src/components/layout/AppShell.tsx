"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { NewSongDialog } from "@/components/studio/NewSongDialog";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { ImportSongDialog } from "@/components/studio/ImportSongDialog";
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

interface AppShellActions {
  openNewSong: () => void;
  openSettings: () => void;
}

const AppShellContext = createContext<AppShellActions | null>(null);

/** The shell's dialogs, for screens that need to open one (an empty state's "Abrir Ajustes"). */
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { discovered, confirm } = usePlaylistWatcher();
  const { missing: missingPlaylist, dismiss: dismissMissingPlaylist } = useValidateActivePlaylist();
  const proApiPort = useDesktopStore((s) => s.proApiPort);
  const setActivePlaylist = useDesktopStore((s) => s.setActivePlaylist);
  const goHome = useLibraryStore((s) => s.goHome);

  const onSongsScreen = pathname === SONGS_PATH;

  // A new or imported song opens on the songs screen, so starting one from another screen goes
  // there first; the dialog opens over it.
  const showSongsScreen = () => {
    if (!onSongsScreen) router.push(SONGS_PATH);
  };
  const openNewSongDialog = () => {
    showSongsScreen();
    setDialogOpen(true);
  };
  const openImportDialog = () => {
    showSongsScreen();
    setImportOpen(true);
  };

  // On the songs screen Home clears the current song (see goHome). From any other screen it only
  // leads back, so a song in progress is still there when the user returns.
  const handleHome = () => {
    if (onSongsScreen) goHome();
    else router.push(SONGS_PATH);
  };

  const actions: AppShellActions = { openNewSong: openNewSongDialog, openSettings: () => setSettingsOpen(true) };

  if (!mounted) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <Header onNewSong={openNewSongDialog} onGoHome={handleHome} />
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
          showTitle={!desktop}
          showSettings={desktop}
          onOpenSettings={() => setSettingsOpen(true)}
          onImport={desktop ? openImportDialog : undefined}
          backgrounds={desktop ? { href: BACKGROUNDS_PATH, active: pathname === BACKGROUNDS_PATH } : undefined}
        />
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <NewSongDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
        {desktop && <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
        {desktop && <ImportSongDialog open={importOpen} onClose={() => setImportOpen(false)} />}
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
