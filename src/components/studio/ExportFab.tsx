"use client";

import { useEffect, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import type { Song } from "@/lib/types";
import { isDesktopApp } from "@/lib/tauri/env";
import { useDesktopStore } from "@/lib/desktopStore";
import { PlaylistPickerModal } from "@/components/settings/PlaylistPickerModal";
import { ExportOverwriteModal } from "@/components/studio/ExportOverwriteModal";
import { addToPlaylist, exportToLibraryFolder, findExportConflict } from "@/lib/desktop/api";
import { playlistStillExists } from "@/lib/desktop/playlistStillExists";
import { errorMessage, postForFile } from "@/lib/postJson";
import type { ExportConflict } from "@/lib/propresenter/libraries";

interface SavedInfo {
  title: string;
  playlistName: string | null;
  addedToPlaylist: boolean;
  /** Why the playlist add failed, shown to the user. Null when it succeeded or wasn't attempted. */
  playlistError: string | null;
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
  const activePlaylist = useDesktopStore((s) => s.activePlaylist);
  const setActivePlaylist = useDesktopStore((s) => s.setActivePlaylist);
  const proApiPort = useDesktopStore((s) => s.proApiPort);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), SAVED_MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  const exportToLibrary = async (
    destinationFolder: string,
    overrides?: { fileName?: string; overwritePath?: string },
  ) => {
    const savedTo = await exportToLibraryFolder({ song, destinationFolder, ...overrides });

    // savedTo is the name actually written to disk, which can differ from what was asked for
    // (writeUniqueFile appends " (2)" etc. on a coincidental collision) — copy that, not the
    // requested name, so pasting into ProPresenter's search always finds the real file.
    const exportedName = baseNameWithoutExt(savedTo);
    copyToClipboard(exportedName);

    // Best-effort: the file is already safely in the Library, so a failure here never fails the
    // export — it's reported to the user instead. Needs the API port configured (Ajustes) and
    // ProPresenter running with Network enabled; there is no file-writing fallback, because
    // writing the playlist document behind a running ProPresenter is invisible until restart.
    let addedToPlaylist = false;
    let playlistError: string | null = null;

    if (activePlaylist) {
      if (!proApiPort) {
        playlistError = "Configure a porta do ProPresenter em Ajustes para adicionar automaticamente.";
      } else {
        try {
          const result = await addToPlaylist({
            port: proApiPort,
            playlistId: activePlaylist.id,
            presentationName: exportedName,
          });
          addedToPlaylist = result.added;
          if (!result.added) playlistError = result.reason;
        } catch (err) {
          playlistError = errorMessage(err);
        }
      }
    }

    setSaved({
      title: overrides?.fileName || song.title || "sua música",
      playlistName: activePlaylist?.name ?? null,
      addedToPlaylist,
      playlistError,
    });
  };

  const downloadFile = async () => {
    const { blob, fileName } = await postForFile("/api/export/propresenter", { song });
    const filename = fileName ?? `${song.title || "musica"}.pro`;
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
        if (activePlaylist && proApiPort) {
          const stillThere = await playlistStillExists(proApiPort, activePlaylist.id);
          if (!stillThere) {
            setActivePlaylist(null);
            setStatus("idle");
            setPickerOpen(true);
            return;
          }
        }

        const name = song.title || "Música sem título";
        const found = await findExportConflict(libraryFolder, name);

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
      setError(errorMessage(err));
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
      setConflictError(errorMessage(err));
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
          <div className="flex-1">
            <p>
              Música importada com sucesso!
              {saved.addedToPlaylist && saved.playlistName ? (
                <>
                  <br />
                  Adicionada à playlist <strong>{saved.playlistName}</strong>.
                </>
              ) : (
                <>
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
                </>
              )}
            </p>
            {saved.playlistError && (
              <p className="mt-1 text-red-600">
                Não deu pra adicionar à playlist. {saved.playlistError}
              </p>
            )}
          </div>
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
        port={proApiPort}
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
