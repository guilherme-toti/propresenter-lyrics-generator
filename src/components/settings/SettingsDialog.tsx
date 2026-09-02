"use client";

import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useDesktopStore } from "@/lib/desktopStore";
import { PlaylistPickerModal } from "./PlaylistPickerModal";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

function FolderRow({
  label,
  description,
  value,
  onPick,
}: {
  label: string;
  description: string;
  value: string | null;
  onPick: () => void;
}) {
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-ink">{label}</h3>
      <p className="mb-2 text-xs text-ink/60">{description}</p>
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink/70">
          {value ?? "Nenhuma pasta selecionada"}
        </span>
        <Button variant="secondary" size="sm" onClick={onPick}>
          Escolher
        </Button>
      </div>
    </section>
  );
}

export function SettingsDialog({ open: isOpen, onClose }: SettingsDialogProps) {
  const libraryFolder = useDesktopStore((s) => s.libraryFolder);
  const playlistsFolder = useDesktopStore((s) => s.playlistsFolder);
  const activePlaylist = useDesktopStore((s) => s.activePlaylist);
  const setLibraryFolder = useDesktopStore((s) => s.setLibraryFolder);
  const setPlaylistsFolder = useDesktopStore((s) => s.setPlaylistsFolder);
  const setActivePlaylist = useDesktopStore((s) => s.setActivePlaylist);
  const [pickerOpen, setPickerOpen] = useState(false);

  const pickLibraryFolder = async () => {
    const folder = await open({ directory: true, multiple: false, title: "Pasta da Library do ProPresenter" });
    if (typeof folder === "string") setLibraryFolder(folder);
  };

  const pickPlaylistsFolder = async () => {
    const folder = await open({ directory: true, multiple: false, title: "Pasta de Playlists do ProPresenter" });
    if (typeof folder === "string") setPlaylistsFolder(folder);
  };

  return (
    <>
      <Modal open={isOpen} onClose={onClose} title="Ajustes">
        <div className="flex flex-col gap-5">
          <FolderRow
            label="Pasta da Library"
            description="Onde os arquivos .pro exportados são salvos. O ProPresenter já lê essa pasta nativamente — depois é só arrastar para a playlist desejada."
            value={libraryFolder}
            onPick={pickLibraryFolder}
          />

          <FolderRow
            label="Pasta de Playlists"
            description="Usada só para detectar quando uma nova playlist é criada no ProPresenter e sugerir ela como destino."
            value={playlistsFolder}
            onPick={pickPlaylistsFolder}
          />

          <section>
            <h3 className="mb-1 text-sm font-semibold text-ink">Playlist de destino</h3>
            <p className="mb-2 text-xs text-ink/60">
              Só um lembrete visual de para onde arrastar o arquivo exportado — não afeta onde ele é salvo.
            </p>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink/70">
                {activePlaylist?.name ?? "Nenhuma selecionada"}
              </span>
              <Button variant="secondary" size="sm" disabled={!playlistsFolder} onClick={() => setPickerOpen(true)}>
                Trocar
              </Button>
            </div>
          </section>
        </div>
      </Modal>

      <PlaylistPickerModal
        open={pickerOpen}
        folder={playlistsFolder}
        onClose={() => setPickerOpen(false)}
        onSelect={setActivePlaylist}
        title="Escolher playlist de destino"
      />
    </>
  );
}
