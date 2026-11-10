"use client";

import type { PointerEvent } from "react";
import { Check, FolderOpen, ImagePlus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { trayPreviewUrl } from "@/lib/backgrounds/api";
import type { TrayFile, TrayRefusal } from "@/lib/propresenter/backgrounds/tray";
import { InlineMessage } from "@/components/ui/InlineMessage";
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

const IDLE_HINT = "Arraste cada arquivo até uma tela, ou clique nele e depois na tela.";

/** Where the week's files wait before each is dragged onto a screen. A panel beside the macros, so
 * it stays in reach however far down they go; it scrolls by itself when the files don't fit. */
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
  const hint = receivingFiles ? "Solte para adicionar" : selectedId ? "Agora clique na tela onde ele vai." : IDLE_HINT;
  const background = receivingFiles ? "bg-cream-200" : "bg-cream-100";

  // Above the files, where they're seen however long the list is. Shown with none too: a first
  // drop can be refused whole.
  const messages = (refusals.length > 0 || error) && (
    <InlineMessage tone="error" variant="boxed" onDismiss={onDismissMessages} className="mx-4 mb-3">
      <ul>
        {error && <li>{error}</li>}
        {refusals.map((refusal, index) => (
          <li key={`${refusal.fileName}-${index}`}>
            <span className="font-medium">{refusal.fileName}:</span> {refusal.message}
          </li>
        ))}
      </ul>
    </InlineMessage>
  );

  return (
    <section
      aria-label="Arquivos da semana"
      className={cn(
        // Takes whatever the macros leave, and fits more files per row as it grows.
        "flex h-full min-w-[22rem] flex-1 flex-col overflow-y-auto border-r border-line transition-colors",
        background,
        // Inset, so the dashed edge marks the drop zone without moving the files.
        receivingFiles && "outline-2 -outline-offset-8 outline-dashed outline-accent",
      )}
    >
      {tray.length === 0 ? (
        <>
          {messages && <div className="pt-4">{messages}</div>}
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-cream-200 text-ink/70">
              <ImagePlus size={22} aria-hidden />
            </span>
            <p className="text-base font-medium text-ink">
              {receivingFiles ? "Solte para adicionar" : "Solte aqui os arquivos da semana"}
            </p>
            <p className="text-sm text-ink/60">Depois, arraste cada um até a tela da macro.</p>
            <Button variant="secondary" onClick={onPick} className="mt-2">
              <FolderOpen size={16} aria-hidden />
              Escolher arquivos
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Stays put while the files scroll, with "Adicionar" and what to do next. */}
          <div
            className={cn(
              "sticky top-0 z-10 flex items-start justify-between gap-2 px-4 pb-3 pt-4 transition-colors",
              background,
            )}
          >
            {/* The longest hint, invisible, keeps the row's height, so the files below don't jump
                when a shorter one takes its place. */}
            <div className="grid text-sm text-ink/65">
              <span aria-hidden className="invisible col-start-1 row-start-1">
                {IDLE_HINT}
              </span>
              <p className="col-start-1 row-start-1" aria-live="polite">
                {hint}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onPick} className="-mr-1 shrink-0">
              <Plus size={14} aria-hidden />
              Adicionar
            </Button>
          </div>
          {messages}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] content-start gap-x-3 gap-y-4 px-4 pb-4">
            {tray.map((file) => {
              const selected = file.id === selectedId;
              const uses = useCounts[file.id] ?? 0;
              return (
                <li key={file.id} className={cn("relative min-w-0", draggingId === file.id && "opacity-40")}>
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
                    )}
                  >
                    <MediaPreview
                      src={trayPreviewUrl(file.id)}
                      mediaType={file.mediaType}
                      fileName={file.fileName}
                      fit="contain"
                      sizes="160px"
                    />
                    {selected && (
                      <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-cream-50 p-0.5 text-ink">
                        <Check size={14} aria-hidden />
                      </span>
                    )}
                    {/* A badge rather than a line under the name, so staging doesn't shift the
                        files below. */}
                    {uses > 0 && (
                      <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-cream-50 px-2 py-0.5 text-xs font-semibold text-ink">
                        Em {uses} {uses === 1 ? "tela" : "telas"}
                      </span>
                    )}
                  </button>
                  {/* Over the thumbnail rather than beside the name, so the name gets the tile's
                      whole width. A sibling, so pressing it never starts a drag. */}
                  <button
                    type="button"
                    onClick={() => onRemove(file.id)}
                    aria-label={`Tirar ${file.fileName} da lista`}
                    title="Tirar da lista"
                    className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 p-1 text-cream-50 transition-colors hover:bg-ink"
                  >
                    <X size={14} />
                  </button>
                  {/* The whole name, wrapped between words: a week's files often differ only at
                      the end. A word too long for the line still breaks rather than overflow. */}
                  <p className="mt-1.5 break-words text-sm leading-snug text-ink/75">{file.fileName}</p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
