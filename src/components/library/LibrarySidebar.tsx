"use client";

import { useState } from "react";
import { MoreVertical, Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLibraryStore } from "@/lib/store";

function timeAgo(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface LibrarySidebarProps {
  onNewProject: () => void;
}

export function LibrarySidebar({ onNewProject }: LibrarySidebarProps) {
  const songs = useLibraryStore((s) => s.songs);
  const activeSongId = useLibraryStore((s) => s.activeSongId);
  const selectSong = useLibraryStore((s) => s.selectSong);
  const deleteSong = useLibraryStore((s) => s.deleteSong);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-line bg-cream-100/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink/45">Projects</p>
      </div>
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">Your library</h2>

      <button
        onClick={onNewProject}
        className="mb-4 inline-flex items-center gap-1.5 self-start rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-ink/90"
      >
        <Plus size={14} />
        New
      </button>

      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {songs.length === 0 && (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-ink/45">
            No songs yet. Start a new project to get going.
          </p>
        )}

        {songs.map((song) => (
          <div
            key={song.id}
            className={cn(
              "group relative rounded-xl border px-3 py-2.5 transition-colors",
              song.id === activeSongId
                ? "border-accent/40 bg-white shadow-sm"
                : "border-transparent hover:bg-white/70",
            )}
          >
            <button className="flex w-full flex-col items-start text-left" onClick={() => selectSong(song.id)}>
              <span className="flex w-full items-center gap-1.5">
                {song.mode === "ai" && <Sparkles size={12} className="shrink-0 text-accent" />}
                <span className="truncate text-sm font-medium text-ink">{song.title || "Untitled song"}</span>
              </span>
              <span className="mt-0.5 text-[11px] text-ink/45">{timeAgo(song.updatedAt)}</span>
            </button>

            <button
              className="absolute right-2 top-2 rounded-md p-1 text-ink/30 opacity-0 transition-opacity hover:bg-ink/5 hover:text-ink/70 group-hover:opacity-100"
              onClick={() => setMenuOpenFor((current) => (current === song.id ? null : song.id))}
              aria-label="Song options"
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
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
