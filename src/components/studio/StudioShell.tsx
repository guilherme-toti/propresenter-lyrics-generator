"use client";

import Image from "next/image";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SongMetadataCard } from "@/components/studio/SongMetadataCard";
import { LanguageSourceCard } from "@/components/studio/LanguageSourceCard";
import { LyricsEditors } from "@/components/studio/LyricsEditors";
import { AlignmentPreview } from "@/components/studio/AlignmentPreview";
import { ExportFab } from "@/components/studio/ExportFab";
import { MusixmatchAttribution } from "@/components/studio/MusixmatchAttribution";
import { useLibraryStore } from "@/lib/store";
import { useAutoLiteralTranslation } from "@/lib/useAutoLiteralTranslation";
import poiemaLogo from "@/app/logo_black.png";

function EmptyState({ onNewSong }: { onNewSong: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <Image src={poiemaLogo} alt="Poiema" width={96} height={78} className="mb-2 opacity-90" priority />
      <h2 className="font-display text-2xl font-semibold text-ink">Procure uma música</h2>
      <p className="max-w-sm text-sm text-ink/55">
        Busque uma música e sua tradução, ou cole a letra em dois idiomas você mesmo — de qualquer forma você terá
        um alinhamento linha a linha pronto para exportar para o ProPresenter.
      </p>
      <Button className="mt-2" onClick={onNewSong}>
        <Search size={16} />
        Procurar música
      </Button>
    </div>
  );
}

export function StudioShell({ onNewSong }: { onNewSong: () => void }) {
  const song = useLibraryStore((s) => s.song);
  const { translatingSide, cancel, retranslate } = useAutoLiteralTranslation(song);

  if (!song) {
    return <EmptyState onNewSong={onNewSong} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-8 pb-28">
      <SongMetadataCard song={song} />
      <div className="grid gap-3 sm:grid-cols-2">
        <LanguageSourceCard song={song} side="languageA" label="Português" translating={translatingSide === "languageA"} />
        <LanguageSourceCard song={song} side="languageB" label="Inglês" translating={translatingSide === "languageB"} />
      </div>
      <LyricsEditors
        song={song}
        translatingSide={translatingSide}
        onCancelTranslation={cancel}
        onRetranslate={retranslate}
      />
      <AlignmentPreview song={song} />
      <MusixmatchAttribution song={song} />
      <ExportFab song={song} />
    </div>
  );
}
