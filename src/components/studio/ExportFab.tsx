"use client";

import { useEffect, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import type { Song } from "@/lib/types";
import { isDesktopApp } from "@/lib/tauri/env";
import { useDesktopStore } from "@/lib/desktopStore";
import { PlaylistPickerModal } from "@/components/settings/PlaylistPickerModal";
import { ExportOverwriteModal } from "@/components/studio/ExportOverwriteModal";
import { playlistStillExists } from "@/lib/desktop/playlistStillExists";
import type { ExportConflict } from "@/lib/propresenter/libraries";

interface SavedInfo {
  title: string;
  playlistName: string | null;
}

const SAVED_MESSAGE_TIMEOUT_MS = 15_000;

/** Last path segment, minus the ".pro" extension — works for both "/a/b/Name.pro" (library save,
 * where the server may have adjusted the name, e.g. appending " (2)") and a plain "Name.pro"
 * (browser download's Content-Disposition filename). */
function baseNameWithoutExt(fileNameOrPath: string): string {
  const base = fileNameOrPath.split(/[\\/]/).pop() ?? fileNameOrPath;
  return base.replace(/\.pro$/i, "");
}

/** Best-effort — clicking the export button isn't undone by a clipboard permission failure. */
function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

export function ExportFab({ song }: { song: Song }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedInfo | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [conflict, setConflict] = useState<{ name: string; found: ExportConflict } | null>(null);
  const [conflictSaving, setConflictSaving] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
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

  const exportToLibrary = async (
    destinationFolder: string,
    overrides?: { fileName?: string; overwritePath?: string },
  ) => {
    const res = await fetch("/api/export/propresenter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song, destinationFolder, ...overrides }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Falha ao exportar.");

    // data.savedTo reflects the name actually written to disk, which can differ from what was
    // asked for (writeUniqueFile appends " (2)" etc. on a coincidental collision) — copy that,
    // not the requested name, so pasting into ProPresenter's search always finds the real file.
    if (typeof data.savedTo === "string") copyToClipboard(baseNameWithoutExt(data.savedTo));

    setSaved({ title: overrides?.fileName || song.title || "sua música", playlistName: activePlaylist?.name ?? null });
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
    copyToClipboard(baseNameWithoutExt(filename));

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

        // Never blocks the export on failure — an unreachable check just falls back to the
        // existing, always-safe writeUniqueFile behavior (appends " (2)" instead of overwriting).
        const name = song.title || "Música sem título";
        const found = await fetch("/api/export/check-conflict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ libraryFolder, name }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => (data?.conflict as ExportConflict | null) ?? null)
          .catch(() => null);

        if (found) {
          setStatus("idle");
          setConflictError(null);
          setConflict({ name, found });
          return;
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

  const handleConfirmOverwrite = async (name: string, overwritePath: string | null) => {
    if (!libraryFolder) return;
    setConflictSaving(true);
    setConflictError(null);
    try {
      await exportToLibrary(libraryFolder, { fileName: name, overwritePath: overwritePath ?? undefined });
      setConflict(null);
    } catch (err) {
      setConflictError(err instanceof Error ? err.message : "Falha ao exportar.");
    } finally {
      setConflictSaving(false);
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
        {status === "loading" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
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
      {conflict && libraryFolder && (
        <ExportOverwriteModal
          open
          libraryFolder={libraryFolder}
          initialName={conflict.name}
          initialConflict={conflict.found}
          saving={conflictSaving}
          error={conflictError}
          onClose={() => setConflict(null)}
          onConfirm={(name, overwritePath) => void handleConfirmOverwrite(name, overwritePath)}
        />
      )}
    </div>
  );
}
