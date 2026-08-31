"use client";

import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Field";
import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";

export function SongMetadataCard({ song }: { song: Song }) {
  const updateSong = useLibraryStore((s) => s.updateSong);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-semibold uppercase tracking-widest text-ink/45">Detalhes da música</p>
        {song.mode === "ai" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[12px] font-semibold text-accent">
            <Sparkles size={11} />
            Gerado por IA
            {song.isOfficialTranslation ? " · tradução oficial" : " · tradução por IA"}
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="song-title">Título</Label>
          <Input
            id="song-title"
            value={song.title}
            onChange={(e) => updateSong(song.id, { title: e.target.value })}
            placeholder="Título da música"
          />
        </div>
        <div>
          <Label htmlFor="song-artist">Artista</Label>
          <Input
            id="song-artist"
            value={song.artist}
            onChange={(e) => updateSong(song.id, { artist: e.target.value })}
            placeholder="Artista"
          />
        </div>
      </div>
    </Card>
  );
}
