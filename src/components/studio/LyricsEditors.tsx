"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/Field";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { splitIntoBlocks } from "@/lib/alignment";
import { realignLyrics } from "@/lib/lyricsApi";
import { errorMessage } from "@/lib/postJson";
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
  translatingSide,
  translationFailure,
  onCancelTranslation,
  onDismissTranslationFailure,
  onRetranslate,
}: {
  song: Song;
  side: "languageA" | "languageB";
  onRawChange: (side: "languageA" | "languageB", value: string) => void;
  /** The side a "Traduzir com IA" the user clicked is filling in right now, if any (via StudioShell). */
  translatingSide: "languageA" | "languageB" | null;
  /** Why this side's last "Traduzir com IA" didn't land, in the route's own words. */
  translationFailure: string | null;
  onCancelTranslation: () => void;
  onDismissTranslationFailure: () => void;
  onRetranslate: (side: "languageA" | "languageB") => void;
}) {
  const raw = song[side];
  const translating = translatingSide === side;
  // The translation rewrites both sides from the text sent at the click, so while it runs anything
  // typed into either box would be lost when it lands.
  const locked = translatingSide !== null;

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
          // A second translation would silently cancel the one running on the other side.
          canOfferAiTranslation(song, side) && !locked && (
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
      {translationFailure && (
        <InlineMessage tone="error" onDismiss={onDismissTranslationFailure} className="mb-2">
          {translationFailure}
        </InlineMessage>
      )}
      <TextArea
        rows={12}
        value={raw}
        readOnly={locked}
        aria-busy={locked}
        className={locked ? "opacity-60" : undefined}
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
  translationFailure,
  onCancelTranslation,
  onDismissTranslationFailure,
  onRetranslate,
}: {
  song: Song;
  /** The side a "Traduzir com IA" the user clicked is filling in right now, if any — see StudioShell.
   * Both boxes stay read-only until it lands or is cancelled. */
  translatingSide: "languageA" | "languageB" | null;
  /** The last "Traduzir com IA" that failed, and on which side. */
  translationFailure: { side: "languageA" | "languageB"; message: string } | null;
  onCancelTranslation: () => void;
  onDismissTranslationFailure: () => void;
  onRetranslate: (side: "languageA" | "languageB") => void;
}) {
  const setLanguageRaw = useLibraryStore((s) => s.setLanguageRaw);
  const realignFromManualText = useLibraryStore((s) => s.realignFromManualText);
  const syncAlignmentWithRaw = useLibraryStore((s) => s.syncAlignmentWithRaw);
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
      syncAlignmentWithRaw();
    }, AUTO_REALIGN_DELAY_MS);
  };

  const handleRealignWithAi = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      applyAiRealignment(await realignLyrics(song.languageA, song.languageB));
    } catch (err) {
      setAiError(errorMessage(err));
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
          translatingSide={translatingSide}
          translationFailure={translationFailure?.side === "languageA" ? translationFailure.message : null}
          onCancelTranslation={onCancelTranslation}
          onDismissTranslationFailure={onDismissTranslationFailure}
          onRetranslate={onRetranslate}
        />
        <EditorPanel
          song={song}
          side="languageB"
          onRawChange={handleRawChange}
          translatingSide={translatingSide}
          translationFailure={translationFailure?.side === "languageB" ? translationFailure.message : null}
          onCancelTranslation={onCancelTranslation}
          onDismissTranslationFailure={onDismissTranslationFailure}
          onRetranslate={onRetranslate}
        />
      </div>
      <div className="mt-3 flex flex-col items-center gap-2">
        <div className="flex justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => realignFromManualText()} disabled={translatingSide !== null}>
            <RefreshCw size={13} />
            {hasAlignment ? "Realinhar a partir do texto" : "Alinhar letra"}
          </Button>
          {hasAlignment && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRealignWithAi}
              // A realignment landing after the translation would put back the text from before it.
              disabled={aiLoading || translatingSide !== null}
            >
              {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Realinhar com IA
            </Button>
          )}
        </div>
        {aiError && <InlineMessage tone="error">{aiError}</InlineMessage>}
      </div>
    </div>
  );
}
