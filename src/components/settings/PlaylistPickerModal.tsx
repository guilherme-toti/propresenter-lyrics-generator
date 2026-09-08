"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { PlaylistRef } from "@/lib/desktopStore";

interface PlaylistPickerModalProps {
  open: boolean;
  port: number | null;
  onClose: () => void;
  onSelect: (playlist: PlaylistRef) => void;
  title?: string;
  description?: string;
}

export function PlaylistPickerModal({
  open,
  port,
  onClose,
  onSelect,
  title = "Escolher playlist",
  description,
}: PlaylistPickerModalProps) {
  const [playlists, setPlaylists] = useState<PlaylistRef[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !port) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-open loading kick-off
    setLoading(true);
    fetch("/api/playlists/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setPlaylists(Array.isArray(data.playlists) ? data.playlists : []);
      })
      .catch(() => {
        if (!cancelled) setPlaylists([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, port]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        {description && <p className="text-sm text-ink/60">{description}</p>}
        {!port && (
          <p className="text-sm text-ink/60">Configure a porta do ProPresenter em Ajustes primeiro.</p>
        )}
        {port && loading && <p className="text-sm text-ink/60">Procurando playlists…</p>}
        {port && !loading && playlists.length === 0 && (
          <p className="text-sm text-ink/60">Nenhuma playlist encontrada no ProPresenter.</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <button
                onClick={() => {
                  onSelect(playlist);
                  onClose();
                }}
                className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-ink/5"
              >
                {playlist.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
