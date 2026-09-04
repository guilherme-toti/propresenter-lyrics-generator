"use client";

import { useEffect, useRef, useState } from "react";
import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";

type Side = "languageA" | "languageB";

// Matches the hardcoded labels every other part of the studio already uses (Header/StudioShell/
// LanguageSourceCard render languageA as "Português", languageB as "Inglês") — not a new
// assumption introduced here.
function targetLanguageFor(side: Side): "English" | "Português (Brasil)" {
  return side === "languageA" ? "Português (Brasil)" : "English";
}

/** The one side that's blank while the other has real content and hasn't been auto-translated (or
 * had that skipped) yet — undefined either way (both blank, both filled, or already attempted)
 * means there's nothing for this hook to do. */
function blankSideNeedingTranslation(song: Song): Side | null {
  const aBlank = !song.languageA.trim();
  const bBlank = !song.languageB.trim();
  if (aBlank === bBlank) return null;
  const side: Side = aBlank ? "languageA" : "languageB";
  const status = side === "languageA" ? song.literalTranslationA : song.literalTranslationB;
  return status === undefined ? side : null;
}

/**
 * Fills a blank translation side with a literal AI translation automatically, right when the song
 * screen shows it — instead of the user having to notice and click "Realinhar com IA" themselves.
 * Calls /api/translate-literally (translation only — never /api/realign-song, which reconciles
 * two texts against each other and, given a genuinely different song on one side, would "reconcile"
 * by discarding it rather than translating). Non-blocking: this never disables anything else in
 * the UI (export included) while it runs, and is cancellable.
 *
 * Also exposes retranslate() for LyricsEditors' "Traduzir com IA" link, which must be able to
 * fire even when neither side's literalTranslation status is set to begin with — e.g. Musixmatch
 * already supplied a real translation for both sides, so the auto-fill effect below never ran and
 * never touched either status field. An earlier version had the button just clear that (already
 * undefined) field and rely on the effect noticing — a real bug: clearing a field that's already
 * undefined is not a value change, so the effect's dependency array never saw a difference and
 * never re-ran, leaving the just-blanked side empty with no request ever sent. retranslate() calls
 * the same underlying request directly instead of hoping a store update coincidentally triggers it.
 */
export function useAutoLiteralTranslation(song: Song | null) {
  const applyAiRealignment = useLibraryStore((s) => s.applyAiRealignment);
  const skipLiteralTranslation = useLibraryStore((s) => s.skipLiteralTranslation);
  const revertToLiteralTranslation = useLibraryStore((s) => s.revertToLiteralTranslation);
  // Scoped to the song it belongs to so a stale value from a song just navigated away from is
  // never mistaken for the current one — cheaper and lint-cleaner than resetting it on every
  // effect run just to cover that one transition.
  const [translating, setTranslating] = useState<{ songId: string; side: Side } | null>(null);
  // Identifies the latest attempt; a completion/finally only acts if it's still the one in
  // abortRef, which is what makes React 18 Strict Mode's dev-only mount→cleanup→mount safe: the
  // cleanup aborts the first attempt, the remount starts a second one and reassigns abortRef, and
  // the first attempt's now-stale finally callback (running after, since abort's rejection is a
  // microtask) sees the mismatch and no-ops instead of clobbering the second attempt's state. An
  // earlier version also gated on a "did we already try this key" ref, which seemed like a good
  // idea but actually broke this exact case — it blocked the necessary second attempt too.
  const abortRef = useRef<AbortController | null>(null);

  // Shared by the auto-fill effect below and retranslate() — one real request-sending path, not
  // two copies that could drift.
  function start(songId: string, side: Side, knownText: string) {
    abortRef.current?.abort(); // supersede whatever (if anything) was already in flight
    const controller = new AbortController();
    abortRef.current = controller;

    async function run() {
      setTranslating({ songId, side });
      try {
        const res = await fetch("/api/translate-literally", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            knownSide: side === "languageA" ? "languageB" : "languageA",
            knownText,
            targetLanguage: targetLanguageFor(side),
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Algo deu errado.");
        applyAiRealignment(data, side);
      } catch (err) {
        // AbortError means cancel() already marked this "skipped" — don't do it twice.
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          skipLiteralTranslation(side);
        }
      } finally {
        if (abortRef.current === controller) {
          setTranslating(null);
          abortRef.current = null;
        }
      }
    }
    void run();
    return controller;
  }

  useEffect(() => {
    if (!song) return;
    const side = blankSideNeedingTranslation(song);
    if (!side) return;
    const knownSide: Side = side === "languageA" ? "languageB" : "languageA";
    const controller = start(song.id, side, song[knownSide]);

    // Song changed (or this component unmounted) while the request was still in flight — abort it
    // so a stale response never gets applied to whatever's showing now.
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id, song?.literalTranslationA, song?.literalTranslationB]);

  const translatingSide = translating && song && translating.songId === song.id ? translating.side : null;

  const cancel = () => {
    if (!abortRef.current || !translatingSide) return;
    skipLiteralTranslation(translatingSide);
    abortRef.current.abort();
  };

  /** LyricsEditors' "Traduzir com IA" — drops whatever this side currently has (a picked
   * recording, an existing translation, doesn't matter) and starts a fresh literal translation
   * from the other side's current text. */
  const retranslate = (side: Side) => {
    if (!song) return;
    const knownSide: Side = side === "languageA" ? "languageB" : "languageA";
    const knownText = song[knownSide];
    revertToLiteralTranslation(side);
    start(song.id, side, knownText);
  };

  return { translatingSide, cancel, retranslate };
}
