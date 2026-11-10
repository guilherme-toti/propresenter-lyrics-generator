"use client";

import { useEffect, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { CheckCircle2, CircleDashed, KeyRound, Loader2, MonitorPlay, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { useDesktopStore } from "@/lib/desktopStore";
import { readMaskedApiKey, saveApiKey, testProPresenterConnection } from "@/lib/desktop/api";
import { parsePort } from "@/lib/desktop/parsePort";
import { checkProPresenterFolder } from "@/lib/backgrounds/api";
import { useDetectProPresenterFolder } from "@/lib/backgrounds/useDetectProPresenterFolder";
import { errorMessage } from "@/lib/postJson";
import { PlaylistPickerModal } from "./PlaylistPickerModal";

/** Whether a setting is filled in; null while that's still being found out. */
type SettingState = boolean | null;

/** The shape carries the state, so it reads without telling the colours apart. */
function SettingStatus({ done }: { done: SettingState }) {
  if (done === null) return <Loader2 size={18} aria-hidden className="animate-spin text-ink/50" />;
  const Icon = done ? CheckCircle2 : CircleDashed;
  return (
    <>
      <Icon size={18} aria-hidden className={done ? "text-accent" : "text-ink/50"} />
      <span className="sr-only">{done ? "Configurado" : "Não configurado"}</span>
    </>
  );
}

/**
 * One setting: its state, what it is, then its control with anything said about it underneath.
 * The control column has a fixed width, so the controls of every row line up down the page.
 */
function SettingRow({
  title,
  description,
  done,
  control,
  footer,
}: {
  title: string;
  description: string;
  done: SettingState;
  control: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,24rem)] items-start gap-x-3 px-5 py-5">
      {/* relative: holds the screen-reader label, which is absolutely positioned, in the row
          instead of letting it stretch the page and add a second scrollbar. */}
      <span className="relative mt-0.5 flex">
        <SettingStatus done={done} />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-sm text-ink/60">{description}</p>
      </div>
      {/* min-w-0 so a long folder path or playlist name truncates instead of widening the row. */}
      <div className="ml-5 min-w-0">
        {control}
        {footer}
      </div>
    </div>
  );
}

function SettingsSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink/50">
        <Icon size={16} aria-hidden />
        {title}
      </h2>
      <Card className="divide-y divide-line p-0">{children}</Card>
    </section>
  );
}

/** A saved value and the button that changes it. The box has Input's padding and text size, so it
 * is exactly as tall as the port field, and the button stretches to match it, like "Testar
 * conexão" beside that field. */
function ValueControl({ value, children }: { value: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-stretch gap-2">
      <span className="flex min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink/70">
        {value}
      </span>
      {children}
    </div>
  );
}

/** The folder's own name always shows; the path leading to it gives way first when space runs out. */
function FolderPath({ path }: { path: string }) {
  const nameStart = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1;
  return (
    <span className="flex min-w-0" title={path}>
      <span className="truncate text-ink/45">{path.slice(0, nameStart)}</span>
      <span className="shrink-0 text-ink">{path.slice(nameStart)}</span>
    </span>
  );
}

function FolderRow({
  label,
  description,
  value,
  emptyLabel = "Nenhuma pasta selecionada",
  done = value !== null,
  error,
  onPick,
}: {
  label: string;
  description: string;
  value: string | null;
  emptyLabel?: string;
  done?: SettingState;
  error?: string | null;
  onPick: () => void;
}) {
  return (
    <SettingRow
      title={label}
      description={description}
      done={done}
      control={
        <ValueControl value={value ? <FolderPath path={value} /> : <span className="truncate">{emptyLabel}</span>}>
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
      done={detecting && !folder ? null : folder !== null}
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
      done={proApiPort !== null}
      control={
        // items-stretch, not items-center: Button size="sm" is shorter than the Input, so centring
        // would leave "Testar conexão" visibly smaller than the field beside it. Stretching matches
        // their heights without hardcoding one.
        <div className="flex items-stretch gap-2">
          <Input
            className="flex-1"
            inputMode="numeric"
            aria-label="Porta do ProPresenter"
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
      done={activePlaylist !== null}
      control={
        <ValueControl value={<span className="truncate">{activePlaylist?.name ?? "Nenhuma selecionada"}</span>}>
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
  endpoint,
  title,
  description,
  placeholder,
}: {
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
  }, [endpoint]);

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
      done={loaded ? masked !== null : null}
      control={
        editing ? (
          <Input
            type="password"
            autoFocus
            aria-label={title}
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        ) : (
          <ValueControl
            value={<span className="truncate">{!loaded ? "Carregando…" : (masked ?? "Nenhuma chave configurada")}</span>}
          >
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

export function SettingsScreen() {
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
    <div className="mx-auto w-full max-w-4xl px-8 py-10">
      <h1 className="mb-8 px-1 font-display text-2xl font-semibold text-ink">Ajustes</h1>

      <div className="flex flex-col gap-8">
        <SettingsSection icon={MonitorPlay} title="ProPresenter">
          <FolderRow
            label="Pasta da Library"
            description="Onde os arquivos .pro exportados são salvos. O ProPresenter já lê essa pasta nativamente."
            value={libraryFolder}
            onPick={pickLibraryFolder}
          />
          <ProPresenterFolderRow />
          <ProApiPortRow />
          <PlaylistRow onPick={() => setPickerOpen(true)} />
        </SettingsSection>

        <SettingsSection icon={KeyRound} title="Chaves dos serviços">
          <ApiKeyRow
            endpoint="/api/settings/api-key"
            title="Chave da OpenRouter"
            description={'Usada pelo "Gerar com IA".'}
            placeholder="sk-..."
          />
          <ApiKeyRow
            endpoint="/api/settings/musixmatch-api-key"
            title="Chave da Musixmatch"
            description="Usada pra buscar a letra oficial no catálogo."
            placeholder="Cole a chave da Musixmatch"
          />
        </SettingsSection>
      </div>

      <PlaylistPickerModal
        open={pickerOpen}
        port={proApiPort}
        onClose={() => setPickerOpen(false)}
        onSelect={setActivePlaylist}
        title="Escolher playlist de destino"
      />
    </div>
  );
}
