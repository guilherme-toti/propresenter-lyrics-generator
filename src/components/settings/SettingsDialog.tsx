"use client";

import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useDesktopStore } from "@/lib/desktopStore";
import { parsePort } from "@/lib/desktop/parsePort";
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

function ProApiPortRow() {
  const proApiPort = useDesktopStore((s) => s.proApiPort);
  const setProApiPort = useDesktopStore((s) => s.setProApiPort);
  const [value, setValue] = useState(proApiPort ? String(proApiPort) : "");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const save = (raw: string) => {
    setValue(raw);
    setResult(null);
    setProApiPort(parsePort(raw));
  };

  const invalidInput = value.trim() !== "" && parsePort(value) === null;

  const test = async () => {
    const port = parsePort(value);
    if (port === null) {
      setResult({ ok: false, message: "Informe uma porta válida." });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/propresenter/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port }),
      });
      const data = await res.json();
      setResult(
        data.ok
          ? { ok: true, message: `Conectado: ${data.hostDescription} em ${data.name}` }
          : { ok: false, message: data.error ?? "Falha ao conectar." },
      );
    } catch {
      setResult({ ok: false, message: "Falha ao conectar." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-ink">Porta do ProPresenter</h3>
      <p className="mb-2 text-xs text-ink/60">
        Ative Preferências → Rede no ProPresenter e informe a porta mostrada lá. Sem isso, a música
        é exportada para a Library mas não entra na playlist automaticamente.
      </p>
      <div className="flex items-center gap-2">
        <Input
          className="flex-1"
          inputMode="numeric"
          placeholder="ex.: 62830"
          value={value}
          onChange={(e) => save(e.target.value)}
        />
        <Button variant="secondary" size="sm" onClick={test} disabled={testing}>
          {testing ? "Testando…" : "Testar conexão"}
        </Button>
      </div>
      {invalidInput ? (
        <p className="mt-2 text-xs text-red-600">Porta inválida. Use um número entre 1 e 65535.</p>
      ) : (
        result && (
          <p className={`mt-2 text-xs ${result.ok ? "text-ink/60" : "text-red-600"}`}>
            {result.message}
          </p>
        )
      )}
    </section>
  );
}

/**
 * The key is never sent to this component in full after the initial paste —
 * the API only ever returns a masked form (see the /api/settings/*-api-key
 * routes and src/lib/desktop/envFile.ts), so there's nothing here to leak
 * beyond what's already shown on screen.
 */
function ApiKeyRow({
  isOpen,
  endpoint,
  title,
  description,
  placeholder,
}: {
  isOpen: boolean;
  endpoint: string;
  title: string;
  description: string;
  placeholder: string;
}) {
  const [masked, setMasked] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch(endpoint)
      .then((res) => (res.ok ? res.json() : { masked: null }))
      .then((data) => {
        if (cancelled) return;
        setMasked(data.masked ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMasked(null);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, endpoint]);

  const startEditing = () => {
    setValue("");
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setValue("");
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    if (!value.trim()) {
      setError("Cole uma chave válida.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Algo deu errado.");
      setMasked(data.masked ?? null);
      setValue("");
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo deu errado.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-ink">{title}</h3>
      <p className="mb-2 text-xs text-ink/60">{description}</p>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Input
            type="password"
            autoFocus
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={cancelEditing} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={save} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink/70">
            {!loaded ? "Carregando…" : (masked ?? "Nenhuma chave configurada")}
          </span>
          <Button variant="secondary" size="sm" onClick={startEditing}>
            {masked ? "Alterar" : "Configurar"}
          </Button>
        </div>
      )}
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
          <ApiKeyRow
            isOpen={isOpen}
            endpoint="/api/settings/api-key"
            title="Chave da OpenRouter"
            description={
              'Usada pelo "Gerar com IA". Fica salva só neste computador — nunca é exibida por completo depois de salva.'
            }
            placeholder="sk-..."
          />

          <ApiKeyRow
            isOpen={isOpen}
            endpoint="/api/settings/musixmatch-api-key"
            title="Chave da Musixmatch"
            description="Usada pra buscar a letra oficial no catálogo. Fica salva só neste computador — nunca é exibida por completo depois de salva."
            placeholder="Cole a chave da Musixmatch"
          />

          <FolderRow
            label="Pasta da Library"
            description="Onde os arquivos .pro exportados são salvos. O ProPresenter já lê essa pasta nativamente."
            value={libraryFolder}
            onPick={pickLibraryFolder}
          />

          <FolderRow
            label="Pasta de Playlists"
            description="Usada só para detectar quando uma nova playlist é criada no ProPresenter e sugerir ela como destino."
            value={playlistsFolder}
            onPick={pickPlaylistsFolder}
          />

          <ProApiPortRow />

          <section>
            <h3 className="mb-1 text-sm font-semibold text-ink">Playlist de destino</h3>
            <p className="mb-2 text-xs text-ink/60">
              Playlist onde a música exportada é adicionada automaticamente (requer a porta do ProPresenter configurada).
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
