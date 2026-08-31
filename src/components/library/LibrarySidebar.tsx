"use client";

import { useState } from "react";
import { MoreVertical, Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLibraryStore } from "@/lib/store";

function timeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

interface LibrarySidebarProps {
  open: boolean;
  onNewProject: () => void;
}

export function LibrarySidebar({ open, onNewProject }: LibrarySidebarProps) {
  const songs = useLibraryStore((s) => s.songs);
  const activeSongId = useLibraryStore((s) => s.activeSongId);
  const selectSong = useLibraryStore((s) => s.selectSong);
  const deleteSong = useLibraryStore((s) => s.deleteSong);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  return (
    <div
      className={cn(
        "h-full shrink-0 overflow-hidden border-line bg-cream-100/60 transition-[width] duration-200 ease-in-out",
        open ? "w-72 border-r" : "w-0",
      )}
    >
      <div className="flex h-full w-72 flex-col p-3">
        <button
          onClick={onNewProject}
          className="mb-3 flex items-center gap-2 self-start rounded-full bg-ink/5 px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink/10"
        >
          <Plus size={16} />
          Novo projeto
        </button>

        <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-widest text-ink/40">Recentes</p>

        <div className="flex-1 space-y-0.5 overflow-y-auto">
          {songs.length === 0 && (
            <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-ink/45">
              Nenhuma música ainda. Comece um novo projeto.
            </p>
          )}

          {songs.map((song) => (
            <div
              key={song.id}
              className={cn(
                "group relative rounded-lg px-3 py-2 transition-colors",
                song.id === activeSongId ? "bg-ink/8" : "hover:bg-ink/5",
              )}
            >
              <button className="flex w-full flex-col items-start text-left" onClick={() => selectSong(song.id)}>
                <span className="flex w-full items-center gap-1.5">
                  {song.mode === "ai" && <Sparkles size={12} className="shrink-0 text-accent" />}
                  <span className="truncate text-sm font-medium text-ink">{song.title || "Música sem título"}</span>
                </span>
                <span className="mt-0.5 text-[11px] text-ink/45">{timeAgo(song.updatedAt)}</span>
              </button>

              <button
                className="absolute right-2 top-2 rounded-md p-1 text-ink/30 opacity-0 transition-opacity hover:bg-ink/5 hover:text-ink/70 group-hover:opacity-100"
                onClick={() => setMenuOpenFor((current) => (current === song.id ? null : song.id))}
                aria-label="Opções da música"
              >
                <MoreVertical size={14} />
              </button>

              {menuOpenFor === song.id && (
                <div className="absolute right-2 top-8 z-10 w-36 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                    onClick={() => {
                      deleteSong(song.id);
                      setMenuOpenFor(null);
                    }}
                  >
                    <Trash2 size={13} />
                    Excluir
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
