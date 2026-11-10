"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input, Label } from "@/components/ui/Field";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { PickRow } from "@/components/ui/PickRow";
import { useDesktopStore } from "@/lib/desktopStore";
import { useImportSong, useOpenLibraryFile, type ImportableFile } from "@/lib/useImportSong";

interface ImportSongDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ImportSongDialog({ open, onClose }: ImportSongDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title="Importar do ProPresenter">
      <ImportSongPicker onClose={onClose} />
    </Modal>
  );
}

/** Mounted only while the dialog is open, so every opening re-reads the library and starts with
 * an empty filter and no leftover error. */
function ImportSongPicker({ onClose }: { onClose: () => void }) {
  const libraryFolder = useDesktopStore((s) => s.libraryFolder);
  const { list } = useImportSong();
  const libraryFile = useOpenLibraryFile(onClose);

  const [files, setFiles] = useState<ImportableFile[]>([]);
  const [query, setQuery] = useState("");
  // Starts true: the listing kicks off on mount, and "no files found" mustn't flash first.
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (!libraryFolder) return;
    const folder = libraryFolder;

    async function run() {
      const result = await list(folder);
      setLoading(false);
      if ("error" in result) {
        setListError(result.error);
        return;
      }
      setFiles(result.files);
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryFolder]);

  if (!libraryFolder) {
    return <p className="text-sm text-ink/55">Configure a Pasta da Library em Ajustes antes de importar.</p>;
  }

  const filtered = files.filter((file) => file.filename.toLowerCase().includes(query.trim().toLowerCase()));
  const error = libraryFile.error ?? listError;

  return (
    <div className="space-y-4">
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
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      {!loading && files.length === 0 && !listError && <p className="text-sm text-ink/55">Nenhum arquivo .pro encontrado.</p>}
      {!loading && files.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-ink/55">Nada encontrado com esse filtro.</p>
      )}

      {filtered.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {filtered.map((file) => (
            <li key={file.path}>
              <PickRow
                title={file.name}
                subtitle={file.library}
                busy={libraryFile.openingPath === file.path}
                disabled={libraryFile.openingPath !== null}
                onClick={() => void libraryFile.open(file)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
