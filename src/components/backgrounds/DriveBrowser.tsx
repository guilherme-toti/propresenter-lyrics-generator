"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  FileX,
  Film,
  Folder,
  ImageIcon,
  Loader2,
  RefreshCw,
  Settings,
} from "lucide-react";
import Image from "next/image";
import { useAppShellActions } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { useDesktopStore } from "@/lib/desktopStore";
import { downloadDriveFile, openDriveFolder } from "@/lib/drive/api";
import type { DriveEntry, DriveFolderReply, DriveRef } from "@/lib/drive/contracts";
import { formatModified, formatSize } from "@/lib/drive/driveFormat";
import { driveFolderUrl, NOT_A_FOLDER_LINK, parseDriveFolderLink } from "@/lib/drive/driveLinks";
import { errorMessage } from "@/lib/postJson";
import { VideoBadge } from "./MediaPreview";

/** Which of the tray's Drive buttons opened the browser. */
export type DriveStart = "default" | "link";

type Listing =
  | { status: "loading" }
  | { status: "done"; reply: DriveFolderReply; loadedAt: Date }
  | { status: "error"; message: string };

interface Download {
  entry: DriveEntry;
  status: "waiting" | "downloading" | "done" | "error";
  received: number;
  total: number | null;
  message?: string;
}

/** Full width, stuck to the modal's bottom edge while the list scrolls. The modal scrolls inside
 * its 24px padding, and a sticky element stops short of that padding, hence -bottom-6 to reach the
 * edge (with bottom-0 it rode 24px up, over the end of the list). */
const FOOTER_CLASSES =
  "sticky -bottom-6 -mx-6 -mb-6 mt-5 flex items-center justify-between gap-3 border-t border-line bg-cream-50 px-6 py-4";

function LinkStep({ saveAsDefault, onOpen }: { saveAsDefault: boolean; onOpen: (ref: DriveRef) => void }) {
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const ref = parseDriveFolderLink(value);
    if (!ref) {
      setInvalid(true);
      return;
    }
    onOpen(ref);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Label htmlFor="drive-link">{saveAsDefault ? "Link da pasta padrão" : "Link da pasta do Google Drive"}</Label>
      <div className="flex items-stretch gap-2">
        <Input
          id="drive-link"
          autoFocus
          placeholder="https://drive.google.com/drive/folders/…"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
        />
        <Button type="submit" disabled={!value.trim()}>
          Abrir
        </Button>
      </div>
      {invalid ? (
        <InlineMessage tone="error">{NOT_A_FOLDER_LINK}</InlineMessage>
      ) : (
        <p className="text-sm text-ink/55">
          {saveAsDefault
            ? "Ela fica salva para as próximas vezes. Dá pra trocar em Ajustes."
            : "A pasta precisa estar compartilhada com a conta de serviço que está em Ajustes."}
        </p>
      )}
    </form>
  );
}

/** The way down from the folder first opened. A folder not listed yet shows "…" until it is; the
 * first one alone shows nothing, since "Abrindo a pasta…" or its error already says enough. */
function Breadcrumb({
  trail,
  names,
  onGoTo,
}: {
  trail: DriveRef[];
  names: ReadonlyMap<string, string>;
  onGoTo: (index: number) => void;
}) {
  if (trail.length === 1 && !names.has(trail[0].id)) return null;
  return (
    <nav aria-label="Pastas" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
      {trail.map((ref, index) => {
        const last = index === trail.length - 1;
        const name = names.get(ref.id) ?? "…";
        return (
          <span key={`${ref.id}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 && <ChevronRight size={14} aria-hidden className="shrink-0 text-ink/35" />}
            {last ? (
              <span aria-current="location" className="truncate font-semibold text-ink">
                {name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onGoTo(index)}
                className="truncate rounded-md px-1 text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
              >
                {name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function fileMeta(entry: DriveEntry, now: Date): string {
  if (!entry.mediaType) return "Só dá pra usar imagens e vídeos MP4";
  const parts = [entry.modifiedTime && formatModified(entry.modifiedTime, now), entry.size !== null && formatSize(entry.size)];
  return parts.filter(Boolean).join(" · ");
}

function FolderRow({ entry, now, onOpen }: { entry: DriveEntry; now: Date; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/5"
      >
        <Folder size={18} aria-hidden className="shrink-0 text-ink/60" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{entry.name}</span>
        <span className="shrink-0 text-sm text-ink/50">{entry.modifiedTime ? formatModified(entry.modifiedTime, now) : ""}</span>
        <ChevronRight size={16} aria-hidden className="shrink-0 text-ink/40" />
      </button>
    </li>
  );
}

/** A file with the picture Drive made of it, so the week's files can be told apart at a glance.
 * The thumbnail is 16:9, like the screens and most backgrounds. */
function FileRow({
  entry,
  now,
  selected,
  onToggle,
}: {
  entry: DriveEntry;
  now: Date;
  selected: boolean;
  onToggle: () => void;
}) {
  // Drive takes a while to make a new video's thumbnail; until then the file's icon stands in.
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const usable = entry.mediaType !== null;
  const Icon = entry.mediaType === "video" ? Film : entry.mediaType === "image" ? ImageIcon : FileX;
  const thumbnailUrl = thumbnailFailed ? null : entry.thumbnailUrl;

  return (
    <li>
      <label
        className={cn(
          "flex items-center gap-3 px-4 py-3 transition-colors",
          usable ? "cursor-pointer hover:bg-ink/5" : "cursor-not-allowed",
          selected && "bg-cream-100",
        )}
      >
        <input
          type="checkbox"
          checked={selected}
          disabled={!usable}
          onChange={onToggle}
          className="size-4 shrink-0 accent-ink disabled:opacity-40"
        />
        <span
          className={cn(
            "relative aspect-video w-28 shrink-0 overflow-hidden rounded-md",
            thumbnailUrl ? "bg-ink" : "bg-cream-200",
            !usable && "opacity-50",
          )}
        >
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt=""
              fill
              unoptimized
              draggable={false}
              sizes="112px"
              className="object-contain"
              onError={() => setThumbnailFailed(true)}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-ink/45">
              <Icon size={22} aria-hidden />
            </span>
          )}
          {entry.mediaType === "video" && thumbnailUrl && <VideoBadge compact />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm", usable ? "font-medium text-ink" : "text-ink/50")}>
            {entry.name}
          </span>
          <span className="block text-sm text-ink/50">{fileMeta(entry, now)}</span>
        </span>
      </label>
    </li>
  );
}

function DownloadRow({ download }: { download: Download }) {
  const { entry, status, received, total, message } = download;
  const percent = total ? Math.min(100, Math.round((received / total) * 100)) : null;
  const sizeText = total ? `${formatSize(received)} de ${formatSize(total)}` : received > 0 ? formatSize(received) : "";

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex shrink-0">
        {status === "waiting" && <CircleDashed size={18} aria-hidden className="text-ink/50" />}
        {status === "downloading" && <Loader2 size={18} aria-hidden className="animate-spin text-ink/60" />}
        {status === "done" && <CheckCircle2 size={18} aria-hidden className="text-accent" />}
        {status === "error" && <AlertCircle size={18} aria-hidden className="text-red-600" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{entry.name}</p>
        {status === "downloading" && (
          <>
            <div
              role="progressbar"
              aria-label={`Baixando ${entry.name}`}
              aria-valuenow={percent ?? undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream-200"
            >
              <div
                className={cn("h-full rounded-full bg-ink transition-[width]", percent === null && "w-1/3 animate-pulse")}
                style={percent === null ? undefined : { width: `${percent}%` }}
              />
            </div>
            <p className="mt-1 text-sm text-ink/55">{sizeText}</p>
          </>
        )}
        {status === "waiting" && <p className="text-sm text-ink/50">Na fila</p>}
        {status === "done" && <p className="text-sm text-ink/55">Na bandeja</p>}
        {status === "error" && <p className="text-sm text-red-700">{message}</p>}
      </div>
    </li>
  );
}

function DriveBrowserBody({
  start,
  onClose,
  onDownloaded,
}: {
  start: DriveStart;
  onClose: () => void;
  onDownloaded: (paths: string[]) => void;
}) {
  const { openSettings } = useAppShellActions();
  const defaultLink = useDesktopStore((s) => s.driveFolderLink);
  const setDefaultLink = useDesktopStore((s) => s.setDriveFolderLink);
  const defaultRef = start === "default" && defaultLink ? parseDriveFolderLink(defaultLink) : null;

  const [trail, setTrail] = useState<DriveRef[]>(defaultRef ? [defaultRef] : []);
  // Apart from the trail, so naming a folder doesn't count as moving to another one.
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  // A link typed for "Pasta padrão" becomes the default once its folder opens, not before: a
  // mistyped or private one would otherwise stick.
  const pendingDefault = useRef<string | null>(null);
  const [listing, setListing] = useState<Listing>({ status: "loading" });
  const [reloads, setReloads] = useState(0);
  const [selected, setSelected] = useState<ReadonlyMap<string, DriveEntry>>(new Map());
  const [downloads, setDownloads] = useState<Download[] | null>(null);
  const downloadAbort = useRef<AbortController | null>(null);

  const current = trail.at(-1);

  useEffect(() => {
    if (!current) return;
    const controller = new AbortController();
    openDriveFolder(current, controller.signal)
      .then((reply) => {
        setListing({ status: "done", reply, loadedAt: new Date() });
        setNames((known) => new Map(known).set(current.id, reply.name));
        if (pendingDefault.current) {
          setDefaultLink(pendingDefault.current);
          pendingDefault.current = null;
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setListing({ status: "error", message: errorMessage(err) });
      });
    return () => controller.abort();
  }, [current, reloads, setDefaultLink]);

  // Closing the window mid-download stops it.
  useEffect(() => {
    const abort = downloadAbort;
    return () => abort.current?.abort();
  }, []);

  const goTo = (refs: DriveRef[]) => {
    setListing({ status: "loading" });
    setTrail(refs);
  };

  const reload = () => {
    setListing({ status: "loading" });
    setReloads((count) => count + 1);
  };

  const toggle = (entry: DriveEntry) =>
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.set(entry.id, entry);
      return next;
    });

  const updateDownload = (id: string, change: Partial<Download>) =>
    setDownloads((list) => list?.map((item) => (item.entry.id === id ? { ...item, ...change } : item)) ?? null);

  const download = async (entries: DriveEntry[]) => {
    const controller = new AbortController();
    downloadAbort.current = controller;
    setDownloads((list) => {
      const others = list?.filter((item) => !entries.some((entry) => entry.id === item.entry.id)) ?? [];
      return [...others, ...entries.map((entry): Download => ({ entry, status: "waiting", received: 0, total: entry.size }))];
    });

    let failed = false;
    // One at a time: each gets the whole connection, so the first is ready to use soonest. Each
    // goes into the tray as soon as it's down, so stopping halfway keeps the ones already done.
    for (const entry of entries) {
      updateDownload(entry.id, { status: "downloading" });
      try {
        const filePath = await downloadDriveFile(
          { id: entry.id, resourceKey: entry.resourceKey },
          (received, total) => updateDownload(entry.id, { received, total }),
          controller.signal,
        );
        onDownloaded([filePath]);
        updateDownload(entry.id, { status: "done" });
      } catch (err) {
        if (controller.signal.aborted) return;
        failed = true;
        updateDownload(entry.id, { status: "error", message: errorMessage(err) });
      }
    }
    downloadAbort.current = null;
    if (!failed) onClose();
  };

  const cancelDownloads = () => {
    downloadAbort.current?.abort();
    downloadAbort.current = null;
    setDownloads(null);
  };

  const openSettingsInstead = () => {
    onClose();
    openSettings();
  };

  if (!current) {
    return (
      <LinkStep
        saveAsDefault={start === "default"}
        onOpen={(ref) => {
          if (start === "default") pendingDefault.current = driveFolderUrl(ref);
          goTo([ref]);
        }}
      />
    );
  }

  if (downloads) {
    const running = downloads.some((item) => item.status === "waiting" || item.status === "downloading");
    const finished = downloads.filter((item) => item.status === "done" || item.status === "error").length;
    const failedEntries = downloads.filter((item) => item.status === "error").map((item) => item.entry);
    return (
      <div>
        <ul aria-label="Downloads" className="divide-y divide-line rounded-xl border border-line bg-white">
          {downloads.map((item) => (
            <DownloadRow key={item.entry.id} download={item} />
          ))}
        </ul>
        <div className={FOOTER_CLASSES}>
          <p className="text-sm text-ink/60" aria-live="polite">
            {running
              ? `Baixando ${finished + 1} de ${downloads.length}…`
              : "Os que baixaram já estão na bandeja."}
          </p>
          {running ? (
            <Button variant="secondary" onClick={cancelDownloads}>
              Cancelar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Fechar
              </Button>
              <Button onClick={() => void download(failedEntries)}>
                <RefreshCw size={16} aria-hidden />
                Tentar de novo
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumb trail={trail} names={names} onGoTo={(index) => goTo(trail.slice(0, index + 1))} />

      {listing.status === "loading" && (
        <p className="flex items-center gap-2 py-10 text-sm text-ink/55">
          <Loader2 size={16} aria-hidden className="animate-spin" />
          Abrindo a pasta…
        </p>
      )}

      {listing.status === "error" && (
        <div className="flex flex-col items-start gap-3 py-4">
          <InlineMessage tone="error">{listing.message}</InlineMessage>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={reload}>
              <RefreshCw size={14} aria-hidden />
              Tentar de novo
            </Button>
            <Button variant="ghost" size="sm" onClick={openSettingsInstead}>
              <Settings size={14} aria-hidden />
              Abrir Ajustes
            </Button>
          </div>
        </div>
      )}

      {listing.status === "done" && listing.reply.entries.length === 0 && (
        <p className="py-10 text-center text-sm text-ink/55">Essa pasta está vazia.</p>
      )}

      {listing.status === "done" && listing.reply.entries.length > 0 && (
        <ul aria-label={listing.reply.name} className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {listing.reply.entries.map((entry) =>
            entry.kind === "folder" ? (
              <FolderRow
                key={entry.id}
                entry={entry}
                now={listing.loadedAt}
                onOpen={() => {
                  setNames((known) => new Map(known).set(entry.id, entry.name));
                  goTo([...trail, { id: entry.id, resourceKey: entry.resourceKey }]);
                }}
              />
            ) : (
              <FileRow
                key={entry.id}
                entry={entry}
                now={listing.loadedAt}
                selected={selected.has(entry.id)}
                onToggle={() => toggle(entry)}
              />
            ),
          )}
        </ul>
      )}

      {/* Not under an error or while loading, unless files picked in another folder are waiting. */}
      {(listing.status === "done" || selected.size > 0) && (
        <div className={FOOTER_CLASSES}>
          <p className="text-sm text-ink/60" aria-live="polite">
            {selected.size === 0
              ? "Marque os arquivos que vão para a bandeja."
              : `${selected.size} ${selected.size === 1 ? "arquivo escolhido" : "arquivos escolhidos"}`}
          </p>
          <Button disabled={selected.size === 0} onClick={() => void download([...selected.values()])}>
            Adicionar à bandeja
          </Button>
        </div>
      )}
    </div>
  );
}

/** Browses a public Google Drive folder and downloads the files picked, for the tray. Opens on the
 * default folder from Ajustes, or asks for a link first. */
export function DriveBrowser({
  start,
  onClose,
  onDownloaded,
}: {
  /** Null while closed. */
  start: DriveStart | null;
  onClose: () => void;
  onDownloaded: (paths: string[]) => void;
}) {
  return (
    <Modal open={start !== null} onClose={onClose} title="Google Drive" className="max-w-3xl">
      {start && <DriveBrowserBody start={start} onClose={onClose} onDownloaded={onDownloaded} />}
    </Modal>
  );
}
