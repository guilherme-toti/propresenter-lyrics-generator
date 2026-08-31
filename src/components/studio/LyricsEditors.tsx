"use client";

import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
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
  const raw = song[side];

  const stats = useMemo(() => {
    const blocks = splitIntoBlocks(raw);
    const lines = blocks.reduce((sum, b) => sum + b.length, 0);
    return { lines, sections: blocks.length };
  }, [raw]);

  return (
    <Card className="flex flex-1 flex-col">
      <p className="mb-2 font-display text-base font-semibold text-ink">
        {side === "languageA" ? "Português" : "Inglês"}
      </p>
      <TextArea
        rows={12}
        value={raw}
        onChange={(e) => setLanguageRaw(song.id, side, e.target.value)}
        placeholder="Cole a letra aqui. Deixe uma linha em branco entre as seções (verso, refrão, ponte…)."
      />
      <div className="mt-2 flex gap-2 text-[11px] text-ink/45">
        <span className="rounded-full border border-line px-2 py-0.5">Linhas: {stats.lines}</span>
        <span className="rounded-full border border-line px-2 py-0.5">Seções: {stats.sections}</span>
      </div>
    </Card>
  );
}

export function LyricsEditors({ song }: { song: Song }) {
  const realignFromManualText = useLibraryStore((s) => s.realignFromManualText);
  const applyAiRealignment = useLibraryStore((s) => s.applyAiRealignment);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const hasAlignment = song.alignment.length > 0;

  const handleRealignWithAi = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/realign-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languageARaw: song.languageA, languageBRaw: song.languageB }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Algo deu errado.");
      }
      applyAiRealignment(song.id, data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Algo deu errado.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <EditorPanel song={song} side="languageA" />
        <EditorPanel song={song} side="languageB" />
      </div>
      <div className="mt-3 flex flex-col items-center gap-2">
        <div className="flex justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => realignFromManualText(song.id)}>
            <RefreshCw size={13} />
            {hasAlignment ? "Realinhar a partir do texto" : "Alinhar letra"}
          </Button>
          {hasAlignment && (
            <Button variant="secondary" size="sm" onClick={handleRealignWithAi} disabled={aiLoading}>
              {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Realinhar com IA
            </Button>
          )}
        </div>
        {aiError && <p className="text-xs text-red-600">{aiError}</p>}
      </div>
    </div>
  );
}
