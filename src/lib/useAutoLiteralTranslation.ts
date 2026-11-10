"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage, postJsonAs } from "@/lib/postJson";
import { realignedLyricsReplySchema } from "@/lib/songSchema";
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
 * "reconcile" by discarding it rather than translating). While it runs, StudioShell locks only what
 * its reply overwrites: both editors, both "Buscar" buttons, the realign buttons and the alignment
 * preview. Export and the rest stay available, and it's cancellable. The song is only written once
 * a translation lands, so a failed or cancelled one leaves the side exactly as it was.
 */
export function useAutoLiteralTranslation(song: Song | null) {
  const applyLiteralTranslation = useLibraryStore((s) => s.applyLiteralTranslation);
  // Both scoped to the song they belong to so a stale value from a song just navigated away from
  // is never mistaken for the current one — cheaper and lint-cleaner than resetting them on every
  // effect run just to cover that one transition.
  const [translating, setTranslating] = useState<{ songId: string; side: Side } | null>(null);
  const [failure, setFailure] = useState<{ songId: string; side: Side; message: string } | null>(null);
  // Identifies the latest attempt; a completion only acts if it's still the one in abortRef — so a
  // superseded request (song switched away from, or the user re-clicked "Traduzir com IA" before
  // the first attempt landed) can't clobber state that no longer belongs to it.
  const abortRef = useRef<AbortController | null>(null);

  function start(songId: string, side: Side, knownText: string) {
    abortRef.current?.abort(); // supersede whatever (if anything) was already in flight
    const controller = new AbortController();
    abortRef.current = controller;

    async function run() {
      setTranslating({ songId, side });
      setFailure(null);
      try {
        const translated = await postJsonAs(
          "/api/translate-literally",
          {
            knownSide: side === "languageA" ? "languageB" : "languageA",
            knownText,
            targetLanguage: targetLanguageFor(side),
          },
          realignedLyricsReplySchema,
          { signal: controller.signal },
        );
        // A reply that arrives just as the user cancels (or switches songs) must not land.
        if (!controller.signal.aborted) applyLiteralTranslation(side, translated);
      } catch (err) {
        // A cancel isn't a failure to report; the side simply stays as it was.
        if (!controller.signal.aborted) setFailure({ songId, side, message: errorMessage(err) });
      } finally {
        if (abortRef.current === controller) {
          setTranslating(null);
          abortRef.current = null;
        }
      }
    }
    void run();
  }

  // Nothing here starts a translation — only cancels one already in flight if the user navigates
  // to a different song (or away from the studio) before it lands, so a stale response never gets
  // applied to whatever's showing now.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, [song?.id]);

  const translatingSide = translating && song && translating.songId === song.id ? translating.side : null;
  const translationFailure =
    failure && song && failure.songId === song.id ? { side: failure.side, message: failure.message } : null;

  const cancel = () => abortRef.current?.abort();

  const dismissFailure = () => setFailure(null);

  /** LyricsEditors' "Traduzir com IA" — starts a fresh literal translation of this side from the
   * other side's current text. Whatever this side has now (a picked recording, an existing
   * translation) stays until the new translation lands. */
  const retranslate = (side: Side) => {
    if (!song) return;
    const knownSide: Side = side === "languageA" ? "languageB" : "languageA";
    start(song.id, side, song[knownSide]);
  };

  return { translatingSide, translationFailure, cancel, dismissFailure, retranslate };
}
