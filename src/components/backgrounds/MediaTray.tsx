"use client";

import type { PointerEvent } from "react";
import { Check, FolderOpen, ImagePlus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { trayPreviewUrl } from "@/lib/backgrounds/api";
import type { TrayFile, TrayRefusal } from "@/lib/propresenter/backgrounds/tray";
import { DismissibleAlert } from "@/components/ui/DismissibleAlert";
import { MediaPreview } from "./MediaPreview";

type PointerHandlers = Record<
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel",
  (event: PointerEvent<HTMLElement>) => void
>;

interface MediaTrayProps {
  tray: TrayFile[];
  selectedId: string | null;
  draggingId: string | null;
  /** Files from Finder or Explorer are over the window, but not over a screen. */
  receivingFiles: boolean;
  /** How many screens each tray file is staged on, by tray file id. */
  useCounts: Record<string, number>;
  refusals: TrayRefusal[];
  error: string | null;
  onPick: () => void;
  onSelect: (trayFileId: string) => void;
  onRemove: (trayFileId: string) => void;
  onDismissMessages: () => void;
  pointerHandlersFor: (trayFileId: string) => PointerHandlers;
  clickGuard: (onClick: () => void) => () => void;
}

/** Where the week's files wait before each is dragged onto a screen. */
export function MediaTray({
  tray,
  selectedId,
  draggingId,
  receivingFiles,
  useCounts,
  refusals,
  error,
  onPick,
  onSelect,
  onRemove,
  onDismissMessages,
  pointerHandlersFor,
  clickGuard,
}: MediaTrayProps) {
  const hint = receivingFiles
    ? "Solte para adicionar"
    : selectedId
      ? "Agora clique na tela onde ele vai."
      : "Arraste cada arquivo até uma tela, ou clique nele e depois na tela.";

  return (
    <section
      aria-label="Arquivos da semana"
      className={cn(
        "rounded-2xl border-2 border-dashed p-4 transition-colors",
        receivingFiles ? "border-accent bg-cream-200/70" : "border-line bg-cream-100/70",
      )}
    >
      {tray.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-cream-200 text-ink/70">
            <ImagePlus size={22} aria-hidden />
          </span>
          <p className="text-base font-medium text-ink">
            {receivingFiles ? "Solte para adicionar" : "Solte aqui os fundos e props da semana"}
          </p>
          <p className="text-sm text-ink/60">Depois, arraste cada um até a tela da macro.</p>
          <Button variant="secondary" onClick={onPick} className="mt-2">
            <FolderOpen size={16} aria-hidden />
            Escolher arquivos
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink/65" aria-live="polite">
              {hint}
            </p>
            <Button variant="ghost" size="sm" onClick={onPick}>
              <Plus size={14} aria-hidden />
              Adicionar
            </Button>
          </div>
          <ul className="flex flex-wrap gap-3">
            {tray.map((file) => {
              const selected = file.id === selectedId;
              const uses = useCounts[file.id] ?? 0;
              return (
                <li key={file.id} className="w-28">
                  <button
                    type="button"
                    {...pointerHandlersFor(file.id)}
                    onClick={clickGuard(() => onSelect(file.id))}
                    aria-pressed={selected}
                    aria-label={`Escolher ${file.fileName}`}
                    title={file.fileName}
                    className={cn(
                      "relative block aspect-square w-full cursor-grab touch-none select-none overflow-hidden rounded-lg bg-ink ring-offset-2 ring-offset-cream-100 active:cursor-grabbing",
                      selected && "ring-2 ring-ink",
                      draggingId === file.id && "opacity-40",
                    )}
                  >
                    <MediaPreview
                      src={trayPreviewUrl(file.id)}
                      mediaType={file.mediaType}
                      fileName={file.fileName}
                      fit="contain"
                      sizes="112px"
                    />
                    {selected && (
                      <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-cream-50 p-0.5 text-ink">
                        <Check size={14} aria-hidden />
                      </span>
                    )}
                    {/* A badge rather than a line under the name, so staging doesn't push the
                        macros down. */}
                    {uses > 0 && (
                      <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-cream-50 px-2 py-0.5 text-xs font-semibold text-ink">
                        Em {uses} {uses === 1 ? "tela" : "telas"}
                      </span>
                    )}
                  </button>
                  <div className="mt-1 flex items-center gap-1">
                    <p className="min-w-0 flex-1 truncate text-sm text-ink/70" title={file.fileName}>
                      {file.fileName}
                    </p>
                    <button
                      type="button"
                      onClick={() => onRemove(file.id)}
                      aria-label={`Tirar ${file.fileName} da lista`}
                      title="Tirar da lista"
                      className="shrink-0 rounded-full p-0.5 text-ink/40 transition-colors hover:text-ink"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {(refusals.length > 0 || error) && (
        <DismissibleAlert onDismiss={onDismissMessages} className="mt-3">
          <ul>
            {error && <li>{error}</li>}
            {refusals.map((refusal, index) => (
              <li key={`${refusal.fileName}-${index}`}>
                <span className="font-medium">{refusal.fileName}:</span> {refusal.message}
              </li>
            ))}
          </ul>
        </DismissibleAlert>
      )}
    </section>
  );
}
