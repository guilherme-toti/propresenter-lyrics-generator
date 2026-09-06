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

/**
 * Runs a literal AI translation for one side, on demand — only ever started by the user clicking
 * LyricsEditors' "Traduzir com IA" link (via retranslate() below), never automatically. A blank
 * side with no official translation (e.g. Musixmatch had nothing for the other language) is left
 * blank until the user asks for one; this hook just knows how to run and track that request once
 * they do. Calls /api/translate-literally (translation only — never /api/realign-song, which
 * reconciles two texts against each other and, given a genuinely different song on one side, would
 * "reconcile" by discarding it rather than translating). Non-blocking: this never disables anything
 * else in the UI (export included) while it runs, and is cancellable.
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
  // abortRef — so a superseded request (song switched away from, or the user re-clicked
  // "Traduzir com IA" before the first attempt landed) can't clobber state that no longer belongs
  // to it.
  const abortRef = useRef<AbortController | null>(null);

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

  // Nothing here starts a translation — only cancels one already in flight if the user navigates
  // to a different song (or away from the studio) before it lands, so a stale response never gets
  // applied to whatever's showing now.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, [song?.id]);

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
