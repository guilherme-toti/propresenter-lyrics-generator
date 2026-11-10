"use client";

import { useEffect, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { useDesktopStore } from "@/lib/desktopStore";
import { readMaskedApiKey, saveApiKey, testProPresenterConnection } from "@/lib/desktop/api";
import { parsePort } from "@/lib/desktop/parsePort";
import { checkProPresenterFolder } from "@/lib/backgrounds/api";
import { useDetectProPresenterFolder } from "@/lib/backgrounds/useDetectProPresenterFolder";
import { errorMessage } from "@/lib/postJson";
import { cn } from "@/lib/cn";
import { PlaylistPickerModal } from "./PlaylistPickerModal";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * One setting: what it is, its control, then anything said about it. Each part takes its own row of
 * a subgrid, so inside a PairedSettings grid the two controls stay level however the descriptions
 * wrap, and a message under one never pushes the other one down.
 */
function SettingRow({
  title,
  description,
  control,
  footer,
}: {
  title: string;
  description: string;
  control: ReactNode;
  footer?: ReactNode;
}) {
  return (
    // grid-cols-1 is minmax(0, 1fr): without it the column sizes to its content, so a long folder
    // path or playlist name widens the row and pushes its button out of the dialog.
    <section className="row-span-3 grid grid-cols-1 grid-rows-subgrid">
      <div>
        <h4 className="mb-1 text-sm font-semibold text-ink">{title}</h4>
        <p className="mb-2 text-sm text-ink/60">{description}</p>
      </div>
      {control}
      <div>{footer}</div>
    </section>
  );
}

/** The window is never narrower than 960px (min_inner_size in src-tauri/src/lib.rs), so a pair
 * always has room to sit side by side. */
function PairedSettings({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid grid-cols-2 gap-x-4", className)}>{children}</div>;
}

/** A saved value and the button that changes it. The box has Input's padding and text size, so it
 * is exactly as tall as an input in the setting beside it. */
function ValueControl({ value, children }: { value: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 truncate rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink/70">
        {value}
      </span>
      {children}
    </div>
  );
}

function FolderRow({
  label,
  description,
  value,
  emptyLabel = "Nenhuma pasta selecionada",
  error,
  onPick,
}: {
  label: string;
  description: string;
  value: string | null;
  emptyLabel?: string;
  error?: string | null;
  onPick: () => void;
}) {
  return (
    <SettingRow
      title={label}
      description={description}
      control={
        <ValueControl value={value ?? emptyLabel}>
          <Button variant="secondary" size="sm" onClick={onPick}>
            Escolher
          </Button>
        </ValueControl>
      }
      footer={
        error && (
          <InlineMessage tone="error" className="mt-2">
            {error}
          </InlineMessage>
        )
      }
    />
  );
}

/** Filled in by itself when ProPresenter lists its workspace; a folder picked by hand is checked
 * before it's saved, so the Backgrounds screen never starts from a folder without macros. */
function ProPresenterFolderRow() {
  const folder = useDesktopStore((s) => s.proPresenterFolder);
  const setFolder = useDesktopStore((s) => s.setProPresenterFolder);
  const detecting = useDetectProPresenterFolder();
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Pasta do ProPresenter",
      defaultPath: folder ?? undefined,
    });
    if (typeof picked !== "string") return;
    try {
      const problem = await checkProPresenterFolder({ folder: picked });
      setError(problem);
      if (!problem) setFolder(picked);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <FolderRow
      label="Pasta do ProPresenter"
      description="Onde ficam as macros e as mídias. A tela Backgrounds troca os arquivos daqui."
      value={folder}
      emptyLabel={detecting ? "Procurando…" : undefined}
      error={error}
      onPick={pick}
    />
  );
}

const CONNECTION_OK_TIMEOUT_MS = 5_000;

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

  // A successful test has served its purpose the moment it's read, so it clears itself.
  // Failures stay put — they're actionable, and the user needs them on screen while fixing
  // the port. They're already cleared by `save` on the next keystroke.
  useEffect(() => {
    if (!result?.ok) return;
    const timer = setTimeout(() => setResult(null), CONNECTION_OK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [result]);

  const test = async () => {
    const port = parsePort(value);
    if (port === null) {
      setResult({ ok: false, message: "Informe uma porta válida." });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const reply = await testProPresenterConnection(port);
      setResult(
        reply.ok
          ? { ok: true, message: `Conectado: ${reply.hostDescription} em ${reply.name}` }
          : { ok: false, message: reply.error },
      );
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingRow
      title="Porta do ProPresenter"
      description="Ative Preferências → Rede no ProPresenter e informe a porta mostrada lá. Sem ela, nada é adicionado à playlist."
      control={
        // items-stretch, not items-center: Button size="sm" is shorter than the Input, so centring
        // would leave "Testar conexão" visibly smaller than the field beside it. Stretching matches
        // their heights without hardcoding one.
        <div className="flex items-stretch gap-2">
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
      }
      footer={
        invalidInput ? (
          <InlineMessage tone="error" className="mt-2">
            Porta inválida. Use um número entre 1 e 65535.
          </InlineMessage>
        ) : (
          result && (
            <InlineMessage tone={result.ok ? "success" : "error"} className="mt-2">
              {result.message}
            </InlineMessage>
          )
        )
      }
    />
  );
}

function PlaylistRow({ onPick }: { onPick: () => void }) {
  const activePlaylist = useDesktopStore((s) => s.activePlaylist);
  const proApiPort = useDesktopStore((s) => s.proApiPort);

  return (
    <SettingRow
      title="Playlist de destino"
      description="Playlist onde a música exportada é adicionada automaticamente (requer a porta do ProPresenter configurada)."
      control={
        <ValueControl value={activePlaylist?.name ?? "Nenhuma selecionada"}>
          <Button variant="secondary" size="sm" disabled={!proApiPort} onClick={onPick}>
            Trocar
          </Button>
        </ValueControl>
      }
    />
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
    readMaskedApiKey(endpoint)
      .catch(() => null)
      .then((current) => {
        if (cancelled) return;
        setMasked(current);
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
      setMasked(await saveApiKey(endpoint, value.trim()));
      setValue("");
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingRow
      title={title}
      description={description}
      control={
        editing ? (
          <Input
            type="password"
            autoFocus
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        ) : (
          <ValueControl value={!loaded ? "Carregando…" : (masked ?? "Nenhuma chave configurada")}>
            <Button variant="secondary" size="sm" onClick={startEditing}>
              {masked ? "Alterar" : "Configurar"}
            </Button>
          </ValueControl>
        )
      }
      footer={
        editing && (
          <div className="mt-2 flex flex-col gap-2">
            {error && <InlineMessage tone="error">{error}</InlineMessage>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={cancelEditing} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="primary" size="sm" onClick={save} disabled={saving}>
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        )
      }
    />
  );
}

export function SettingsDialog({ open: isOpen, onClose }: SettingsDialogProps) {
  const libraryFolder = useDesktopStore((s) => s.libraryFolder);
  const proApiPort = useDesktopStore((s) => s.proApiPort);
  const setLibraryFolder = useDesktopStore((s) => s.setLibraryFolder);
  const setActivePlaylist = useDesktopStore((s) => s.setActivePlaylist);
  const [pickerOpen, setPickerOpen] = useState(false);

  const pickLibraryFolder = async () => {
    const folder = await open({ directory: true, multiple: false, title: "Pasta da Library do ProPresenter" });
    if (typeof folder === "string") setLibraryFolder(folder);
  };

  return (
    <>
      <Modal open={isOpen} onClose={onClose} title="Ajustes">
        <div className="flex flex-col gap-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">Chaves dos serviços</h3>
            <PairedSettings className="mt-3">
              <ApiKeyRow
                isOpen={isOpen}
                endpoint="/api/settings/api-key"
                title="Chave da OpenRouter"
                description={'Usada pelo "Gerar com IA".'}
                placeholder="sk-..."
              />

              <ApiKeyRow
                isOpen={isOpen}
                endpoint="/api/settings/musixmatch-api-key"
                title="Chave da Musixmatch"
                description="Usada pra buscar a letra oficial no catálogo."
                placeholder="Cole a chave da Musixmatch"
              />
            </PairedSettings>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">ProPresenter</h3>
            <div className="mt-3 flex flex-col gap-4">
              <FolderRow
                label="Pasta da Library"
                description="Onde os arquivos .pro exportados são salvos. O ProPresenter já lê essa pasta nativamente."
                value={libraryFolder}
                onPick={pickLibraryFolder}
              />

              <ProPresenterFolderRow />

              <PairedSettings>
                <ProApiPortRow />
                <PlaylistRow onPick={() => setPickerOpen(true)} />
              </PairedSettings>
            </div>
          </section>
        </div>
      </Modal>

      <PlaylistPickerModal
        open={pickerOpen}
        port={proApiPort}
        onClose={() => setPickerOpen(false)}
        onSelect={setActivePlaylist}
        title="Escolher playlist de destino"
      />
    </>
  );
}
