"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { splitIntoBlocks } from "@/lib/alignment";
import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";

/**
 * Whether "Traduzir com IA" makes sense on this side. Deliberately NOT based on whether this side
 * currently has its own SideSource — the originally-picked recording sets one too (see
 * aiResponseToSong), so that check alone can't tell "the anchor recording" apart from "a later
 * Buscar swap on the translatable side" (a real bug: it showed on the base/anchor side, and didn't
 * show at all on the translated side once translation succeeded — sourceA truthy for the anchor,
 * sourceB never set at all for an AI-filled translation). translatableSide is set once at
 * generation specifically to answer this, and doesn't change no matter what gets Buscar'd
 * afterward on either side.
 */
function canOfferAiTranslation(song: Song, side: "languageA" | "languageB"): boolean {
  const otherSide = side === "languageA" ? "languageB" : "languageA";
  if (!song[otherSide].trim()) return false;
  if (song.translatableSide) return song.translatableSide === side;
  const ownSource = side === "languageA" ? song.sourceA : song.sourceB;
  return !ownSource;
}

function EditorPanel({
  song,
  side,
  onRawChange,
  translating,
  onCancelTranslation,
  onRetranslate,
}: {
  song: Song;
  side: "languageA" | "languageB";
  onRawChange: (side: "languageA" | "languageB", value: string) => void;
  /** Set by useAutoLiteralTranslation (via StudioShell) while it's filling this side automatically. */
  translating: boolean;
  onCancelTranslation: () => void;
  onRetranslate: (side: "languageA" | "languageB") => void;
}) {
  const raw = song[side];

  const stats = useMemo(() => {
    const blocks = splitIntoBlocks(raw);
    const lines = blocks.reduce((sum, b) => sum + b.length, 0);
    return { lines, sections: blocks.length };
  }, [raw]);

  return (
    <Card className="flex flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-display text-base font-semibold text-ink">
          {side === "languageA" ? "Português" : "Inglês"}
        </p>
        {translating ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink/45">
            <Loader2 size={12} className="animate-spin" />
            Traduzindo…
            <button
              onClick={onCancelTranslation}
              className="underline underline-offset-2 hover:text-ink"
            >
              Cancelar
            </button>
          </span>
        ) : (
          canOfferAiTranslation(song, side) && (
            <button
              onClick={() => onRetranslate(side)}
              title="Traduz este lado literalmente com IA, a partir do texto atual do outro lado."
              className="shrink-0 text-xs text-ink/50 underline underline-offset-2 hover:text-ink"
            >
              Traduzir com IA
            </button>
          )
        )}
      </div>
      <TextArea
        rows={12}
        value={raw}
        onChange={(e) => onRawChange(side, e.target.value)}
        placeholder="Cole a letra aqui. Deixe uma linha em branco entre as seções (verso, refrão, ponte…)."
      />
      <div className="mt-2 flex gap-2 text-[13px] text-ink/45">
        <span className="rounded-full border border-line px-2 py-0.5">Linhas: {stats.lines}</span>
        <span className="rounded-full border border-line px-2 py-0.5">Seções: {stats.sections}</span>
      </div>
    </Card>
  );
}

const AUTO_REALIGN_DELAY_MS = 600;

export function LyricsEditors({
  song,
  translatingSide,
  onCancelTranslation,
  onRetranslate,
}: {
  song: Song;
  /** Which side (if any) useAutoLiteralTranslation is currently filling in — see StudioShell. */
  translatingSide: "languageA" | "languageB" | null;
  onCancelTranslation: () => void;
  onRetranslate: (side: "languageA" | "languageB") => void;
}) {
  const setLanguageRaw = useLibraryStore((s) => s.setLanguageRaw);
  const realignFromManualText = useLibraryStore((s) => s.realignFromManualText);
  const applyAiRealignment = useLibraryStore((s) => s.applyAiRealignment);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const hasAlignment = song.alignment.length > 0;
  const autoRealignTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending auto-realign when switching songs (or unmounting), so it never fires
  // against a song that's no longer the one being edited.
  useEffect(() => {
    return () => {
      if (autoRealignTimer.current) clearTimeout(autoRealignTimer.current);
    };
  }, [song.id]);

  const handleRawChange = (side: "languageA" | "languageB", value: string) => {
    setLanguageRaw(side, value);

    // Only auto-realign once an alignment already exists — the first pass stays an explicit,
    // deliberate action via the "Alinhar letra" button below.
    if (!hasAlignment) return;
    if (autoRealignTimer.current) clearTimeout(autoRealignTimer.current);
    autoRealignTimer.current = setTimeout(() => {
      realignFromManualText();
    }, AUTO_REALIGN_DELAY_MS);
  };

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
      applyAiRealignment(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Algo deu errado.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <EditorPanel
          song={song}
          side="languageA"
          onRawChange={handleRawChange}
          translating={translatingSide === "languageA"}
          onCancelTranslation={onCancelTranslation}
          onRetranslate={onRetranslate}
        />
        <EditorPanel
          song={song}
          side="languageB"
          onRawChange={handleRawChange}
          translating={translatingSide === "languageB"}
          onCancelTranslation={onCancelTranslation}
          onRetranslate={onRetranslate}
        />
      </div>
      <div className="mt-3 flex flex-col items-center gap-2">
        <div className="flex justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => realignFromManualText()}>
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
