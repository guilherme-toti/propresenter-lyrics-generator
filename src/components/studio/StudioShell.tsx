"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SongMetadataCard } from "@/components/studio/SongMetadataCard";
import { LyricsEditors } from "@/components/studio/LyricsEditors";
import { AlignmentPreview } from "@/components/studio/AlignmentPreview";
import { ExportPanel } from "@/components/studio/ExportPanel";
import { useLibraryStore } from "@/lib/store";

function EmptyState({ onNewProject }: { onNewProject: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Sparkles size={22} />
      </div>
      <h2 className="font-display text-2xl font-semibold text-ink">Comece seu primeiro projeto</h2>
      <p className="max-w-sm text-sm text-ink/55">
        Deixe a IA encontrar uma música e sua tradução, ou cole a letra em dois idiomas você mesmo — de qualquer
        forma você terá um alinhamento linha a linha pronto para exportar para o ProPresenter.
      </p>
      <Button className="mt-2" onClick={onNewProject}>
        <Sparkles size={16} />
        Novo projeto
      </Button>
    </div>
  );
}

export function StudioShell({ onNewProject }: { onNewProject: () => void }) {
  const songs = useLibraryStore((s) => s.songs);
  const activeSongId = useLibraryStore((s) => s.activeSongId);
  const song = songs.find((s) => s.id === activeSongId);

  if (!song) {
    return <EmptyState onNewProject={onNewProject} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-8">
      <SongMetadataCard song={song} />
      <LyricsEditors song={song} />
      <AlignmentPreview song={song} />
      <ExportPanel song={song} />
    </div>
  );
}
