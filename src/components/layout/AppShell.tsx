"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { LibrarySidebar } from "@/components/library/LibrarySidebar";
import { StudioShell } from "@/components/studio/StudioShell";
import { NewSongDialog } from "@/components/studio/NewSongDialog";
import { useHasMounted } from "@/lib/useHasMounted";

export function AppShell() {
  // Zustand's persisted store only reflects localStorage after the client mounts; rendering the
  // real UI before then would make the first client render diverge from the server-rendered HTML.
  const mounted = useHasMounted();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!mounted) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <LibrarySidebar onNewProject={() => setDialogOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <StudioShell onNewProject={() => setDialogOpen(true)} />
        </main>
      </div>
      <NewSongDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
