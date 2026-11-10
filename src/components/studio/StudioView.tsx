"use client";

import { useAppShellActions } from "@/components/layout/AppShell";
import { GeneratingOverlay } from "@/components/studio/GeneratingOverlay";
import { StudioShell } from "@/components/studio/StudioShell";
import { useGenerationStore } from "@/lib/generationStore";
import { useLibraryStore } from "@/lib/store";

/** The songs screen: the song being edited, or the generation overlay while one is being made. */
export function StudioView() {
  const { openNewSong } = useAppShellActions();
  const generationQuery = useGenerationStore((s) => s.query);
  const generationError = useGenerationStore((s) => s.error);
  const dismissGeneration = useGenerationStore((s) => s.finish);
  const startSong = useLibraryStore((s) => s.startSong);

  // Escape hatch from a failed generation: start the blank song the user would otherwise
  // have to go back and ask for through "Nova música" → "Criar manualmente".
  const createManuallyFromFailure = () => {
    startSong({ mode: "manual" });
    dismissGeneration();
  };

  if (generationQuery) {
    return (
      <GeneratingOverlay
        query={generationQuery}
        error={generationError}
        onDismiss={dismissGeneration}
        onCreateManually={createManuallyFromFailure}
      />
    );
  }
  return <StudioShell onNewSong={openNewSong} />;
}
