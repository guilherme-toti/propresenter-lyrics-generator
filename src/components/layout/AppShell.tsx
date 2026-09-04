"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { StudioShell } from "@/components/studio/StudioShell";
import { NewSongDialog } from "@/components/studio/NewSongDialog";
import { GeneratingOverlay } from "@/components/studio/GeneratingOverlay";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { PlaylistPickerModal } from "@/components/settings/PlaylistPickerModal";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useHasMounted } from "@/lib/useHasMounted";
import { isDesktopApp } from "@/lib/tauri/env";
import { useDesktopStore } from "@/lib/desktopStore";
import { useGenerationStore } from "@/lib/generationStore";
import { useLibraryStore } from "@/lib/store";
import { usePlaylistWatcher } from "@/lib/desktop/usePlaylistWatcher";
import { useValidateActivePlaylist } from "@/lib/desktop/useValidateActivePlaylist";

export function AppShell() {
  // Zustand's persisted store only reflects localStorage after the client mounts; rendering the
  // real UI before then would make the first client render diverge from the server-rendered HTML.
  const mounted = useHasMounted();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { discovered, confirm } = usePlaylistWatcher();
  const { missing: missingPlaylist, dismiss: dismissMissingPlaylist } = useValidateActivePlaylist();
  const playlistsFolder = useDesktopStore((s) => s.playlistsFolder);
  const setActivePlaylist = useDesktopStore((s) => s.setActivePlaylist);
  const generationQuery = useGenerationStore((s) => s.query);
  const generationError = useGenerationStore((s) => s.error);
  const dismissGeneration = useGenerationStore((s) => s.finish);
  const startSong = useLibraryStore((s) => s.startSong);
  const goHome = useLibraryStore((s) => s.goHome);

  // Escape hatch from a failed generation: start the blank song the user would otherwise
  // have to go back and ask for through "Nova música" → "Criar manualmente".
  const createManuallyFromFailure = () => {
    startSong({ mode: "manual" });
    dismissGeneration();
  };

  const openNewSongDialog = () => setDialogOpen(true);

  if (!mounted) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <Header onNewSong={openNewSongDialog} onGoHome={goHome} />
        <div className="flex flex-1" />
      </div>
    );
  }

  const desktop = isDesktopApp();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        onNewSong={openNewSongDialog}
        onGoHome={goHome}
        showTitle={!desktop}
        showSettings={desktop}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {generationQuery ? (
            <GeneratingOverlay
              query={generationQuery}
              error={generationError}
              onDismiss={dismissGeneration}
              onCreateManually={createManuallyFromFailure}
            />
          ) : (
            <StudioShell onNewSong={openNewSongDialog} />
          )}
        </main>
      </div>
      <NewSongDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      {desktop && <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
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
          folder={playlistsFolder}
          onClose={dismissMissingPlaylist}
          onSelect={setActivePlaylist}
          title="A playlist selecionada não foi encontrada"
          description="Ela pode ter sido renomeada ou apagada no ProPresenter. Escolha outra, ou crie uma nova por lá e feche este aviso pra tentar de novo mais tarde."
        />
      )}
    </div>
  );
}
