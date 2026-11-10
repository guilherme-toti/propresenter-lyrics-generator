"use client";

import { useEffect, useState } from "react";
import { FolderSearch, Loader2, Send, Settings } from "lucide-react";
import type { Song } from "@/lib/types";
import { useDesktopStore } from "@/lib/desktopStore";
import { useAppShellActions } from "@/components/layout/AppShell";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { PlaylistPickerModal } from "@/components/settings/PlaylistPickerModal";
import { ExportOverwriteModal } from "@/components/studio/ExportOverwriteModal";
import { Button } from "@/components/ui/Button";
import { addToPlaylist, exportToLibraryFolder, findExportConflict } from "@/lib/desktop/api";
import { playlistStillExists } from "@/lib/desktop/playlistStillExists";
import { errorMessage } from "@/lib/postJson";
import type { ExportConflict } from "@/lib/propresenter/libraries";

interface SavedInfo {
  title: string;
  playlistName: string | null;
  addedToPlaylist: boolean;
  /** Why the playlist add failed, shown to the user. Null when it succeeded or wasn't attempted. */
  playlistError: string | null;
}

const SAVED_MESSAGE_TIMEOUT_MS = 15_000;

/** Last path segment, minus the ".pro" extension: the name the server actually wrote, which may
 * differ from the one asked for (e.g. " (2)" appended). */
function baseNameWithoutExt(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.pro$/i, "");
}

/** Best-effort — clicking the export button isn't undone by a clipboard permission failure. */
function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

/** Notices stack over the export button, so they float as cards above the page. */
const NOTICE_CLASSES = "w-full max-w-sm shadow-lg";

export function ExportFab({ song }: { song: Song }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedInfo | null>(null);
  const [askedForFolder, setAskedForFolder] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [conflict, setConflict] = useState<{ name: string; found: ExportConflict } | null>(null);
  const [conflictSaving, setConflictSaving] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const canExport = song.alignment.length > 0;

  const libraryFolder = useDesktopStore((s) => s.libraryFolder);
  const activePlaylist = useDesktopStore((s) => s.activePlaylist);
  const setActivePlaylist = useDesktopStore((s) => s.setActivePlaylist);
  const proApiPort = useDesktopStore((s) => s.proApiPort);
  const { openSettings } = useAppShellActions();

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

  const handleExport = async () => {
    setError(null);
    setSaved(null);
    // The Library folder is the only place a file can go: the desktop webview silently drops a
    // browser download, so without the folder there is nothing to try.
    setAskedForFolder(!libraryFolder);
    if (!libraryFolder) return;

    setLoading(true);
    try {
      if (activePlaylist && proApiPort) {
        const stillThere = await playlistStillExists(proApiPort, activePlaylist.id);
        if (!stillThere) {
          setActivePlaylist(null);
          setPickerOpen(true);
          return;
        }
      }

      const name = song.title || "Música sem título";
      const found = await findExportConflict(libraryFolder, name);

      if (found) {
        setConflictError(null);
        setConflict({ name, found });
        return;
      }

      await exportToLibrary(libraryFolder);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
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
      {/* Gone by itself once a folder is chosen in Ajustes. */}
      {askedForFolder && !libraryFolder && (
        <InlineMessage
          tone="info"
          variant="boxed"
          icon={FolderSearch}
          className={NOTICE_CLASSES}
          onDismiss={() => setAskedForFolder(false)}
        >
          <p>Pra exportar, escolha em Ajustes a pasta da Library do ProPresenter.</p>
          <div className="mt-1 flex justify-end">
            <Button variant="ghost" onClick={openSettings}>
              <Settings size={16} aria-hidden />
              Abrir Ajustes
            </Button>
          </div>
        </InlineMessage>
      )}
      {error && (
        <InlineMessage tone="error" variant="boxed" className={NOTICE_CLASSES} onDismiss={() => setError(null)}>
          {error}
        </InlineMessage>
      )}
      {saved && (
        <InlineMessage tone="success" variant="boxed" className={NOTICE_CLASSES} onDismiss={() => setSaved(null)}>
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
            <InlineMessage tone="error" className="mt-1">
              Não deu pra adicionar à playlist. {saved.playlistError}
            </InlineMessage>
          )}
        </InlineMessage>
      )}
      <button
        onClick={handleExport}
        disabled={!canExport || loading}
        title={canExport ? undefined : "Alinhe pelo menos uma linha antes de exportar."}
        className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_4px_var(--color-white)] shadow-white/80 transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
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
