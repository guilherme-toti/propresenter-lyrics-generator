"use client";

import { Menu, Plus, Settings } from "lucide-react";

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewProject: () => void;
  showSettings?: boolean;
  onOpenSettings?: () => void;
}

export function Header({ sidebarOpen, onToggleSidebar, onNewProject, showSettings, onOpenSettings }: HeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b border-line bg-cream-50 px-4 py-3">
      <button
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? "Fechar biblioteca" : "Abrir biblioteca"}
        aria-pressed={sidebarOpen}
        className="rounded-full p-2 text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <Menu size={18} />
      </button>
      <p className="font-display text-base font-semibold text-ink">PMA Lyrics Studio</p>
      <div className="flex-1" />
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
        onClick={onNewProject}
        aria-label="Novo projeto"
        className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-ink/90"
      >
        <Plus size={14} />
        Novo projeto
      </button>
    </header>
  );
}
