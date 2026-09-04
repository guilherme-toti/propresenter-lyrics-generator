"use client";

import { PenLine } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CatalogSearch } from "@/components/studio/CatalogSearch";
import { useLibraryStore } from "@/lib/store";
import { useGenerateSong } from "@/lib/useGenerateSong";
import { useGenerationStore } from "@/lib/generationStore";
import type { TrackCandidate } from "@/lib/lyrics/musixmatch";

interface NewSongDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewSongDialog({ open, onClose }: NewSongDialogProps) {
  const startSong = useLibraryStore((s) => s.startSong);
  const { generate } = useGenerateSong();
  const startGeneration = useGenerationStore((s) => s.start);
  const failGeneration = useGenerationStore((s) => s.fail);
  const finishGeneration = useGenerationStore((s) => s.finish);

  const handleManual = () => {
    startSong({ mode: "manual" });
    onClose();
  };

  const handlePick = async (picked: TrackCandidate) => {
    // Hand off to the full-screen overlay and close, rather than holding the dialog open with a
    // spinner in it — generation takes seconds and the main window is where the result lands.
    startGeneration(`${picked.title}${picked.artist ? ` — ${picked.artist}` : ""}`);
    onClose();

    const result = await generate(picked);
    if ("ok" in result) {
      finishGeneration();
    } else {
      failGeneration(result.error);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nova música">
      <div className="space-y-4">
        <CatalogSearch onPick={(track) => void handlePick(track)} />
        <Button variant="secondary" onClick={handleManual} className="w-full">
          <PenLine size={16} />
          Criar manualmente
        </Button>
      </div>
    </Modal>
  );
}
