"use client";

import Link from "next/link";
import { Download, Home, Images, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

const PILL_BASE =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors";
const PILL_CLASSES = cn(PILL_BASE, "border border-line text-ink/70 hover:bg-ink/5 hover:text-ink");
const FILLED_PILL_CLASSES = cn(PILL_BASE, "bg-ink text-white hover:bg-ink/90");

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
  /** Desktop-only, like onImport: the screen swaps files on this machine's disk. */
  backgrounds?: { href: string; active: boolean };
}

export function Header({
  onNewSong,
  onGoHome,
  showTitle = true,
  showSettings,
  onOpenSettings,
  onImport,
  backgrounds,
}: HeaderProps) {
  return (
    // Two groups that wrap: when both don't fit on a narrow window, the right-hand one drops to a
    // second row (still pushed right) instead of squeezing the labels or being clipped.
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-cream-50 px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <button
          onClick={onGoHome}
          aria-label="Início"
          title="Início"
          className="shrink-0 rounded-full p-2 text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <Home size={18} />
        </button>
        {backgrounds && (
          <Link
            href={backgrounds.href}
            aria-current={backgrounds.active ? "page" : undefined}
            // Filled while on the screen, outlined otherwise: the shape says where you are, not
            // just the colour.
            className={cn(
              PILL_CLASSES,
              backgrounds.active && "border-transparent bg-cream-200 text-ink hover:bg-cream-200",
            )}
          >
            <Images size={14} />
            Backgrounds
          </Link>
        )}
        {onImport && (
          <button onClick={onImport} className={PILL_CLASSES}>
            <Download size={14} />
            Importar
          </button>
        )}
        {showTitle && <p className="font-display text-base font-semibold text-ink">PMA Lyrics Studio</p>}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
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
          // Outlined on Backgrounds, whose own "Enviar para o ProPresenter" is that screen's one
          // filled button.
          className={backgrounds?.active ? PILL_CLASSES : FILLED_PILL_CLASSES}
        >
          <Plus size={14} />
          Nova música
        </button>
      </div>
    </header>
  );
}
