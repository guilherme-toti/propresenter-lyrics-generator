"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, TextArea } from "@/components/ui/Field";
import { splitIntoBlocks } from "@/lib/alignment";
import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";

function EditorPanel({
  song,
  side,
}: {
  song: Song;
  side: "languageA" | "languageB";
}) {
  const setLanguageRaw = useLibraryStore((s) => s.setLanguageRaw);
  const updateSong = useLibraryStore((s) => s.updateSong);
  const block = song[side];

  const stats = useMemo(() => {
    const blocks = splitIntoBlocks(block.raw);
    const lines = blocks.reduce((sum, b) => sum + b.length, 0);
    return { lines, sections: blocks.length };
  }, [block.raw]);

  return (
    <Card className="flex flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink/45">
          {side === "languageA" ? "Editor A" : "Editor B"}
        </p>
      </div>
      <Input
        className="mb-2 !w-auto max-w-[220px] font-display text-base font-semibold"
        value={block.label}
        onChange={(e) => updateSong(song.id, { [side]: { ...block, label: e.target.value } })}
        placeholder="Language name"
      />
      <TextArea
        rows={12}
        value={block.raw}
        onChange={(e) => setLanguageRaw(song.id, side, e.target.value)}
        placeholder="Paste lyrics here. Leave a blank line between sections (verse, chorus, bridge…)."
      />
      <div className="mt-2 flex gap-2 text-[11px] text-ink/45">
        <span className="rounded-full border border-line px-2 py-0.5">Lines: {stats.lines}</span>
        <span className="rounded-full border border-line px-2 py-0.5">Sections: {stats.sections}</span>
      </div>
    </Card>
  );
}

export function LyricsEditors({ song }: { song: Song }) {
  const realignFromManualText = useLibraryStore((s) => s.realignFromManualText);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <EditorPanel song={song} side="languageA" />
        <EditorPanel song={song} side="languageB" />
      </div>
      <div className="mt-3 flex justify-center">
        <Button variant="secondary" size="sm" onClick={() => realignFromManualText(song.id)}>
          <RefreshCw size={13} />
          {song.alignment.length > 0 ? "Re-align from text" : "Align lyrics"}
        </Button>
      </div>
    </div>
  );
}
