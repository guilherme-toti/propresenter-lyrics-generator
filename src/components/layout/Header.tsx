"use client";

import { Download, Home, Plus, Settings } from "lucide-react";

interface HeaderProps {
  onNewSong: () => void;
  onGoHome: () => void;
  // The desktop app's window title bar already shows this — repeating it
  // here would be a visible duplicate, so AppShell only sets this on web.
  showTitle?: boolean;
  showSettings?: boolean;
  onOpenSettings?: () => void;
  /** Desktop-only — see AppShell.tsx, which only passes this when isDesktopApp(). */
  onImport?: () => void;
}

export function Header({
  onNewSong,
  onGoHome,
  showTitle = true,
  showSettings,
  onOpenSettings,
  onImport,
}: HeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b border-line bg-cream-50 px-4 py-3">
      <button
        onClick={onGoHome}
        aria-label="Início"
        title="Início"
        className="rounded-full p-2 text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <Home size={18} />
      </button>
      {showTitle && <p className="font-display text-base font-semibold text-ink">PMA Lyrics Studio</p>}
      <div className="flex-1" />
      {onImport && (
        <button
          onClick={onImport}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <Download size={14} />
          Importar
        </button>
      )}
      {showSettings && (
        <button
          onClick={onOpenSettings}
          aria-label="Ajustes"
          className="rounded-full p-2 text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <Settings size={18} />
        </button>
      )}
      <button
        onClick={onNewSong}
        aria-label="Nova música"
        className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-ink/90"
      >
        <Plus size={14} />
        Nova música
      </button>
    </header>
  );
}
