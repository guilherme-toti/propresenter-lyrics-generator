"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { PlaylistRef } from "@/lib/propresenter/contracts";
import { usePlaylists } from "@/lib/desktop/usePlaylists";

interface PlaylistPickerModalProps {
  open: boolean;
  port: number | null;
  onClose: () => void;
  onSelect: (playlist: PlaylistRef) => void;
  title?: string;
  description?: string;
}

/** Rendered inside the Modal, which mounts its children only while open, so every opening asks
 * ProPresenter again instead of showing the list from last time. */
function PlaylistChoices({ port, onPick }: { port: number; onPick: (playlist: PlaylistRef) => void }) {
  const { playlists, error, loading, reload } = usePlaylists(port);

  if (loading) return <p className="text-sm text-ink/60">Procurando playlists…</p>;

  if (error) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="flex items-start gap-1.5 text-sm text-red-600">
          <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
          {error}
        </p>
        <Button variant="secondary" size="sm" onClick={reload}>
          <RefreshCw size={13} aria-hidden />
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (playlists.length === 0) {
    return <p className="text-sm text-ink/60">Nenhuma playlist encontrada no ProPresenter.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {playlists.map((playlist) => (
        <li key={playlist.id}>
          <button
            onClick={() => onPick(playlist)}
            className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-ink/5"
          >
            {playlist.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PlaylistPickerModal({
  open,
  port,
  onClose,
  onSelect,
  title = "Escolher playlist",
  description,
}: PlaylistPickerModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        {description && <p className="text-sm text-ink/60">{description}</p>}
        {port ? (
          <PlaylistChoices
            port={port}
            onPick={(playlist) => {
              onSelect(playlist);
              onClose();
            }}
          />
        ) : (
          <p className="text-sm text-ink/60">Configure a porta do ProPresenter em Ajustes primeiro.</p>
        )}
      </div>
    </Modal>
  );
}
