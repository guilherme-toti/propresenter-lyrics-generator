"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import type { Song } from "@/lib/types";
import { isDesktopApp } from "@/lib/tauri/env";
import { useDesktopStore } from "@/lib/desktopStore";
import { PlaylistPickerModal } from "@/components/settings/PlaylistPickerModal";
import { playlistStillExists } from "@/lib/desktop/playlistStillExists";

interface SavedInfo {
  title: string;
  playlistName: string | null;
}

const SAVED_MESSAGE_TIMEOUT_MS = 15_000;

export function ExportFab({ song }: { song: Song }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedInfo | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const canExport = song.alignment.length > 0;

  const libraryFolder = useDesktopStore((s) => s.libraryFolder);
  const playlistsFolder = useDesktopStore((s) => s.playlistsFolder);
  const activePlaylist = useDesktopStore((s) => s.activePlaylist);
  const setActivePlaylist = useDesktopStore((s) => s.setActivePlaylist);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), SAVED_MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  const exportToLibrary = async (destinationFolder: string) => {
    const res = await fetch("/api/export/propresenter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song, destinationFolder }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Falha ao exportar.");

    setSaved({ title: song.title || "sua música", playlistName: activePlaylist?.name ?? null });
  };

  const downloadFile = async () => {
    const res = await fetch("/api/export/propresenter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Falha ao exportar.");
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match ? decodeURIComponent(match[1]) : `${song.title || "musica"}.pro`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setStatus("loading");
    setError(null);
    setSaved(null);
    try {
      if (isDesktopApp() && libraryFolder) {
        if (activePlaylist && playlistsFolder) {
          const stillThere = await playlistStillExists(playlistsFolder, activePlaylist.id);
          if (!stillThere) {
            setActivePlaylist(null);
            setStatus("idle");
            setPickerOpen(true);
            return;
          }
        }
        await exportToLibrary(libraryFolder);
      } else {
        await downloadFile();
      }
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao exportar.");
      setStatus("error");
    }
  };

  return (
    <div className="fixed bottom-6 right-10 z-40 flex flex-col items-end gap-2">
      {error && (
        <p className="max-w-xs rounded-lg border border-line bg-white px-3 py-2 text-xs text-red-600 shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
          {error}
        </p>
      )}
      {saved && (
        <div className="flex w-full max-w-sm items-start gap-2 rounded-lg border border-line bg-white px-3 py-2.5 text-xs text-ink shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
          <p className="flex-1">
            Música importada com sucesso!
            <br />
            Procure por <strong>{saved.title}</strong> no ProPresenter
            {saved.playlistName ? (
              <>
                {" "}
                e arraste para a playlist <strong>{saved.playlistName}</strong>.
              </>
            ) : (
              "."
            )}
          </p>
          <button
            onClick={() => setSaved(null)}
            aria-label="Fechar aviso"
            className="shrink-0 rounded-full p-0.5 text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <button
        onClick={handleExport}
        disabled={!canExport || status === "loading"}
        title={canExport ? undefined : "Alinhe pelo menos uma linha antes de exportar."}
        className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-[0_6px_24px_rgba(255,255,255,0.55)] transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "loading" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        Enviar para ProPresenter
      </button>
      <PlaylistPickerModal
        open={pickerOpen}
        folder={playlistsFolder}
        onClose={() => setPickerOpen(false)}
        onSelect={setActivePlaylist}
        title="A playlist selecionada não existe mais"
        description="Escolha outra playlist de destino (ou feche e exporte mesmo assim, sem uma selecionada)."
      />
    </div>
  );
}
