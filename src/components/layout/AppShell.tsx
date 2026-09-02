"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { LibrarySidebar } from "@/components/library/LibrarySidebar";
import { StudioShell } from "@/components/studio/StudioShell";
import { NewSongDialog } from "@/components/studio/NewSongDialog";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useHasMounted } from "@/lib/useHasMounted";
import { isDesktopApp } from "@/lib/tauri/env";
import { usePlaylistWatcher } from "@/lib/desktop/usePlaylistWatcher";

export function AppShell() {
  // Zustand's persisted store only reflects localStorage after the client mounts; rendering the
  // real UI before then would make the first client render diverge from the server-rendered HTML.
  const mounted = useHasMounted();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { discovered, confirm } = usePlaylistWatcher();

  const openNewProjectDialog = () => setDialogOpen(true);
  const toggleSidebar = () => setSidebarOpen((current) => !current);

  if (!mounted) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <Header sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} onNewProject={openNewProjectDialog} />
        <div className="flex flex-1" />
      </div>
    );
  }

  const desktop = isDesktopApp();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onNewProject={openNewProjectDialog}
        showSettings={desktop}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <LibrarySidebar open={sidebarOpen} onNewProject={openNewProjectDialog} />
        <main className="flex-1 overflow-y-auto">
          <StudioShell onNewProject={openNewProjectDialog} />
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
    </div>
  );
}
