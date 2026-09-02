"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Window } from "@tauri-apps/api/window";
import { useGenerateSong } from "@/lib/useGenerateSong";

/**
 * Standalone popup window, opened by the global hotkey (see src-tauri/src/lib.rs)
 * without bringing up the rest of the app. Captures just enough to kick off
 * "Generate with AI", then hands off to the main window's normal flow — see
 * AppShell's "song-created" listener, which selects the new song there.
 */
export default function QuickAddPage() {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { generate, loading, error, setError } = useGenerateSong();

  const focusInput = () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  useEffect(() => {
    focusInput();
    const win = getCurrentWebviewWindow();

    // The window is reused (shown/hidden, not recreated) on every hotkey
    // press — reset it each time it reappears. See show_quick_add() in Rust.
    const unlistenShown = win.listen("quick-add-shown", () => {
      setQuery("");
      setError(null);
      focusInput();
    });

    const unlistenFocus = win.onFocusChanged(({ payload: focused }) => {
      if (!focused) void win.hide();
    });

    return () => {
      void unlistenShown.then((f) => f());
      void unlistenFocus.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setError identity is stable enough here
  }, []);

  const close = () => {
    setQuery("");
    setError(null);
    void getCurrentWebviewWindow().hide();
  };

  const handleSubmit = async () => {
    const id = await generate(query);
    if (!id) return;

    await emit("song-created", { id });
    const main = await Window.getByLabel("main");
    await main?.show();
    await main?.setFocus();
    close();
  };

  return (
    <div className="flex h-screen w-screen items-center gap-3 border border-line bg-cream-50 px-4">
      <Sparkles size={18} className="shrink-0 text-accent" />
      <input
        ref={inputRef}
        value={query}
        disabled={loading}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleSubmit();
          if (e.key === "Escape") close();
        }}
        placeholder="Título, trecho da letra ou descrição da música…"
        className="w-full flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink/40"
      />
      {loading && <Loader2 size={18} className="shrink-0 animate-spin text-ink/50" />}
      {error && (
        <p className="absolute inset-x-4 bottom-2 truncate text-xs text-red-600" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}
