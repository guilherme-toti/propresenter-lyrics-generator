"use client";

import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Field";
import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";

export function SongMetadataCard({ song }: { song: Song }) {
  const updateSong = useLibraryStore((s) => s.updateSong);

  return (
    <Card className="grid gap-3 !p-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="song-title">Título</Label>
        <Input
          id="song-title"
          value={song.title}
          onChange={(e) => updateSong({ title: e.target.value })}
          placeholder="Título da música"
        />
      </div>
      <div>
        <Label htmlFor="song-artist">Artista</Label>
        <Input
          id="song-artist"
          value={song.artist}
          onChange={(e) => updateSong({ artist: e.target.value })}
          placeholder="Artista"
        />
      </div>
    </Card>
  );
}
