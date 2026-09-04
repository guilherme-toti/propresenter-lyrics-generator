"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input, Label } from "@/components/ui/Field";
import { useDesktopStore } from "@/lib/desktopStore";
import { useLibraryStore } from "@/lib/store";
import { useImportSong, type ImportableFile } from "@/lib/useImportSong";

interface ImportSongDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ImportSongDialog({ open, onClose }: ImportSongDialogProps) {
  const libraryFolder = useDesktopStore((s) => s.libraryFolder);
  const startSong = useLibraryStore((s) => s.startSong);
  const { list, importFile } = useImportSong();

  const [files, setFiles] = useState<ImportableFile[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [importingPath, setImportingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !libraryFolder) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setQuery("");
    void list(libraryFolder).then((result) => {
      setLoading(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setFiles(result.files);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, libraryFolder]);

  const filtered = files.filter((file) => file.filename.toLowerCase().includes(query.trim().toLowerCase()));

  const handlePick = async (file: ImportableFile) => {
    setImportingPath(file.path);
    setError(null);
    const result = await importFile(file.path);
    setImportingPath(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    startSong(result.song);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Importar do ProPresenter">
      <div className="space-y-4">
        {!libraryFolder ? (
          <p className="text-sm text-ink/55">Configure a Pasta da Library em Ajustes antes de importar.</p>
        ) : (
          <>
            <div>
              <Label htmlFor="import-query">Filtrar por nome do arquivo</Label>
              <Input
                id="import-query"
                autoFocus
                placeholder="ex.: Oceans"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {loading && (
              <p className="flex items-center gap-2 text-sm text-ink/55">
                <Loader2 size={14} className="animate-spin" />
                Procurando arquivos…
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!loading && files.length === 0 && !error && <p className="text-sm text-ink/55">Nenhum arquivo .pro encontrado.</p>}
            {!loading && files.length > 0 && filtered.length === 0 && (
              <p className="text-sm text-ink/55">Nada encontrado com esse filtro.</p>
            )}

            {filtered.length > 0 && (
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {filtered.map((file) => (
                  <li key={file.path}>
                    <button
                      onClick={() => void handlePick(file)}
                      disabled={importingPath !== null}
                      className="flex w-full items-baseline justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent/5 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{file.filename}</span>
                        <span className="block truncate text-xs text-ink/55">{file.library}</span>
                      </span>
                      {importingPath === file.path && <Loader2 size={14} className="shrink-0 animate-spin" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
