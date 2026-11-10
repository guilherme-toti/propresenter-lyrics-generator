"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Home, Images, Search, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const PILL_BASE =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors";
const PILL_CLASSES = cn(PILL_BASE, "border border-line text-ink/70 hover:bg-ink/5 hover:text-ink");
// The transparent border keeps it the same size as the outlined pill it swaps with.
const FILLED_PILL_CLASSES = cn(PILL_BASE, "border border-transparent bg-ink text-white hover:bg-ink/90");
const NAV_ITEM_CLASSES = cn(PILL_BASE, "text-sm font-medium text-ink/60 hover:bg-ink/5 hover:text-ink");
/** The screen you're on gets a filled shape, so where you are doesn't rest on colour alone. */
const ACTIVE_NAV_ITEM_CLASSES = "bg-cream-200 text-ink";

function NavDivider() {
  return <span aria-hidden className="h-4 w-px shrink-0 bg-line" />;
}

/** A screen the header leads to, and whether it's the one on show. */
interface NavTarget {
  href: string;
  active: boolean;
}

function NavLink({ target, icon: Icon, children }: { target: NavTarget; icon: LucideIcon; children: ReactNode }) {
  return (
    <Link
      href={target.href}
      aria-current={target.active ? "page" : undefined}
      className={cn(NAV_ITEM_CLASSES, target.active && ACTIVE_NAV_ITEM_CLASSES)}
    >
      <Icon size={16} aria-hidden />
      {children}
    </Link>
  );
}

interface HeaderProps {
  onNewSong: () => void;
  onGoHome: () => void;
  /** On the songs screen, which Início leads to. */
  homeActive: boolean;
  // The desktop app's window title bar already shows this — repeating it
  // here would be a visible duplicate, so AppShell only sets this on web.
  showTitle?: boolean;
  /** Desktop-only, like `backgrounds` — see AppShell.tsx, which only passes them when
   * isDesktopApp(): both screens work on this machine's disk. */
  settings?: NavTarget;
  backgrounds?: NavTarget;
}

export function Header({
  onNewSong,
  onGoHome,
  homeActive,
  showTitle = true,
  settings,
  backgrounds,
}: HeaderProps) {
  return (
    // Two groups that wrap: when both don't fit on a narrow window, the right-hand one drops to a
    // second row (still pushed right) instead of squeezing the labels or being clipped.
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-cream-50 px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {settings && (
          <>
            <NavLink target={settings} icon={Settings}>
              Ajustes
            </NavLink>
            <NavDivider />
          </>
        )}
        <button
          onClick={onGoHome}
          aria-current={homeActive ? "page" : undefined}
          className={cn(NAV_ITEM_CLASSES, homeActive && ACTIVE_NAV_ITEM_CLASSES)}
        >
          <Home size={16} aria-hidden />
          Início
        </button>
        {backgrounds && (
          <>
            <NavDivider />
            <NavLink target={backgrounds} icon={Images}>
              Backgrounds
            </NavLink>
          </>
        )}
        {showTitle && <p className="font-display text-base font-semibold text-ink">PMA Lyrics Studio</p>}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <button
          onClick={onNewSong}
          // Filled only on the songs screen, where finding a song is the thing to do. Backgrounds and
          // Ajustes have their own filled button ("Enviar para o ProPresenter", "Salvar").
          className={homeActive ? FILLED_PILL_CLASSES : PILL_CLASSES}
        >
          <Search size={14} />
          Procurar música
        </button>
      </div>
    </header>
  );
}
