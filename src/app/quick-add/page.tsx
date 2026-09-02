"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Window } from "@tauri-apps/api/window";
import { useGenerateSong } from "@/lib/useGenerateSong";

/**
 * Standalone popup window, opened by the global hotkey (see src-tauri/src/lib.rs)
 * without bringing up the rest of the app. Captures just enough to kick off
 * "Generate with AI", then hands off immediately to the main window: the
 * popup closes right away and the actual generation plays out as a
 * full-screen overlay there (see GeneratingOverlay.tsx +
 * useQuickAddListener.ts), rather than as a cramped inline spinner in this
 * tiny window.
 */
export default function QuickAddPage() {
  const [query, setQuery] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { generate } = useGenerateSong();

  /**
   * Retries focus() across a few animation frames instead of once: this
   * window is created (or re-shown) while some other app usually still has
   * OS-level focus — a background app's window doesn't reliably become the
   * OS-focused window the instant it's created, so calling focus() only once
   * on mount can lose the race and leave the input visually unfocused.
   */
  const focusInput = (attemptsLeft = 20) => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    if (document.activeElement !== el && attemptsLeft > 0) {
      requestAnimationFrame(() => focusInput(attemptsLeft - 1));
    }
  };

  useEffect(() => {
    focusInput();
    const win = getCurrentWebviewWindow();

    // The window is reused (shown/hidden, not recreated) on every hotkey
    // press — reset it each time it reappears. See show_quick_add() in Rust.
    const unlistenShown = win.listen("quick-add-shown", () => {
      setQuery("");
      setValidationError(null);
      focusInput();
    });

    // Extra safety net for the reused-window case: fires reliably once the
    // OS actually hands this window keyboard focus, whenever that lands.
    const unlistenFocus = win.onFocusChanged(({ payload: focused }) => {
      if (focused) focusInput();
      else void win.hide();
    });

    return () => {
      void unlistenShown.then((f) => f());
      void unlistenFocus.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focusInput identity is stable enough here
  }, []);

  const close = () => {
    setQuery("");
    setValidationError(null);
    void getCurrentWebviewWindow().hide();
  };

  const handleSubmit = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setValidationError("Digite o título de uma música, um trecho da letra ou uma breve descrição.");
      return;
    }

    // Hand off to the main window immediately — don't wait for generation to
    // finish before switching, that's the whole point of not showing a
    // spinner in this tiny popup.
    await emit("song-generating", { query: trimmed });
    const main = await Window.getByLabel("main");
    await main?.show();
    await main?.setFocus();
    close();

    const result = await generate(trimmed);
    if ("id" in result) {
      await emit("song-created", { id: result.id });
    } else {
      await emit("song-generation-failed", { error: result.error });
    }
  };

  return (
    <div className="flex h-screen w-screen items-center gap-3 border border-line bg-cream-50 px-4">
      <Sparkles size={18} className="shrink-0 text-accent" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setValidationError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleSubmit();
          if (e.key === "Escape") close();
        }}
        placeholder="Título, trecho da letra ou descrição da música…"
        className="w-full flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink/40"
      />
      {validationError && (
        <p className="absolute inset-x-4 bottom-2 truncate text-xs text-red-600" title={validationError}>
          {validationError}
        </p>
      )}
    </div>
  );
}
