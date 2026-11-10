"use client";

import { ArrowDownToLine, Ban, Check, Link2, Loader2, MoreHorizontal, Redo2, Sparkles, Undo2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { slotDropTargetProps } from "@/lib/backgrounds/dropTargets";
import type { ScreenNotice } from "@/lib/backgrounds/draftStore";
import type { HistoryStep } from "@/lib/backgrounds/links";
import { planReplacement } from "@/lib/propresenter/backgrounds/media";
import type { MediaSlot } from "@/lib/propresenter/backgrounds/slots";
import type { TrayFile } from "@/lib/propresenter/backgrounds/tray";
import { DismissibleAlert } from "@/components/ui/DismissibleAlert";
import { MediaPreview } from "./MediaPreview";

export type ScreenRole = "background" | "prop";

/** "elsewhere" while a file is being dragged but not over this screen (or a screen it changes
 * with); "here" when it is. */
export type FrameDragState = "none" | "elsewhere" | "here";

/** The church's main screen is square and its side panels are tall; files come ready for them. */
const ROLE_FRAME: Record<ScreenRole, { label: string; aspect: string; sizes: string }> = {
  background: { label: "Fundo", aspect: "aspect-square", sizes: "(min-width: 640px) 220px, 60vw" },
  prop: { label: "Prop", aspect: "aspect-[9/16]", sizes: "(min-width: 640px) 130px, 35vw" },
};

const namesList = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

/** A few words for the screen itself, while a file that can't go there is held over it. The full
 * reason shows under the screen if it's dropped anyway. */
export function refusalLabel(slot: MediaSlot, fileName: string): string | null {
  const plan = planReplacement(slot, fileName);
  if (plan.action !== "refuse") return null;
  if (plan.reason === "media-mismatch") return slot.mediaType === "video" ? "Aqui vai um vídeo" : "Aqui vai uma imagem";
  return "Esse arquivo não serve aqui";
}

const BADGE_CLASSES =
  "pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold";

const HISTORY_BUTTON_CLASSES =
  "inline-flex w-fit items-center gap-1 rounded-md text-sm text-ink/60 transition-colors hover:text-ink disabled:opacity-50";

type ScreenBusy = "sending" | HistoryStep;

const BUSY_LABEL: Record<ScreenBusy, string> = {
  sending: "Enviando…",
  undoing: "Desfazendo…",
  redoing: "Refazendo…",
};

interface ScreenFrameProps {
  role: ScreenRole;
  macroName: string;
  slot: MediaSlot;
  previewSrc: string;
  staged: { file: TrayFile; src: string } | null;
  notice: ScreenNotice | null;
  /** The other macros a change here also shows up in. */
  alsoIn: string[];
  /** The macros showing the screen this one follows, when the user linked it to one. */
  follows: string[] | null;
  dragState: FrameDragState;
  /** A tray file is picked and waiting for the screen it goes on. */
  armed: boolean;
  /** Why the file being dragged or picked can't go here, or null when it can. */
  refusal: string | null;
  /** The tray file being dragged, shown in the screen while it's held over it. */
  heldPreview: { src: string; file: TrayFile } | null;
  busy: ScreenBusy | null;
  onActivate: () => void;
  onUnstage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDismissNotice: () => void;
  onEditLink: () => void;
}

/** One of a macro's screens: what it shows now, or the file staged for it. */
export function ScreenFrame({
  role,
  macroName,
  slot,
  previewSrc,
  staged,
  notice,
  alsoIn,
  follows,
  dragState,
  armed,
  refusal,
  heldPreview,
  busy,
  onActivate,
  onUnstage,
  onUndo,
  onRedo,
  onDismissNotice,
  onEditLink,
}: ScreenFrameProps) {
  const frame = ROLE_FRAME[role];
  const shownName = staged?.file.fileName ?? slot.fileName;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative">
        <button
          type="button"
          {...slotDropTargetProps(slot.id)}
          onClick={onActivate}
          disabled={busy !== null}
          aria-label={armed ? `Pôr o arquivo escolhido no ${frame.label.toLowerCase()} de ${macroName}` : `Trocar o ${frame.label.toLowerCase()} de ${macroName}`}
          title={armed ? "Clique para pôr aqui" : "Clique para escolher um arquivo"}
          className={cn(
            "group relative block w-full overflow-hidden rounded-lg bg-ink outline-offset-2 transition-[outline-color] disabled:cursor-wait",
            frame.aspect,
            dragState !== "none" && "outline-2 outline-dashed",
            dragState === "elsewhere" && "outline-ink/20",
            dragState === "here" && (refusal ? "outline-ink/40" : "outline-accent"),
            armed && "outline-2 outline-dashed outline-ink/25",
            armed && (refusal ? "cursor-not-allowed" : "cursor-copy hover:outline-accent"),
          )}
        >
          <MediaPreview
            src={staged ? staged.src : slot.exists ? previewSrc : null}
            mediaType={staged?.file.mediaType ?? slot.mediaType}
            fileName={shownName}
            fit="fill"
            sizes={frame.sizes}
          />
          {dragState === "here" && heldPreview && !refusal ? (
            // The screen shows what it would become, so the drop can be judged before letting go.
            <span className="absolute inset-0 bg-ink">
              {/* Centred: nothing floats over a screen while it shows the held file, and the
                  corners hold its "Vídeo" and "Novo" badges. */}
              <MediaPreview
                src={heldPreview.src}
                mediaType={heldPreview.file.mediaType}
                fileName={heldPreview.file.fileName}
                fit="fill"
                sizes={frame.sizes}
                overlay={
                  <span className="inline-flex items-center gap-1 rounded-full bg-ink/85 px-2.5 py-1 text-sm font-medium text-cream-50 ring-1 ring-cream-50/30">
                    <ArrowDownToLine size={14} aria-hidden />
                    Pôr aqui
                  </span>
                }
              />
            </span>
          ) : (dragState === "here" || armed) && (
            // Nearly opaque, so the words never mix with a "Sem prévia" underneath.
            <span
              className={cn(
                "absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-ink/90 px-2 text-center text-sm font-medium text-cream-50",
                dragState !== "here" && "opacity-0 transition-opacity group-hover:opacity-100",
              )}
            >
              {refusal ? <Ban size={22} aria-hidden /> : <ArrowDownToLine size={22} aria-hidden />}
              {refusal ?? "Pôr aqui"}
            </span>
          )}
          {busy && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-ink/90 text-sm text-cream-50">
              <Loader2 size={18} className="animate-spin" aria-hidden />
              {BUSY_LABEL[busy]}
            </span>
          )}
        </button>

        {staged && !busy && (
          <>
            <span className={cn(BADGE_CLASSES, "bg-accent-dark text-white")}>
              <Sparkles size={12} aria-hidden />
              Novo
            </span>
            <button
              type="button"
              onClick={onUnstage}
              aria-label={`Manter o ${frame.label.toLowerCase()} atual de ${macroName}`}
              title="Manter o atual"
              className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 p-1 text-cream-50 transition-colors hover:bg-ink"
            >
              <X size={14} />
            </button>
          </>
        )}
        {!staged && !busy && notice?.tone === "sent" && (
          <span className={cn(BADGE_CLASSES, "bg-white/90 text-ink")}>
            <Check size={12} aria-hidden />
            Trocado
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-medium text-ink">{frame.label}</p>
          <button
            type="button"
            onClick={onEditLink}
            aria-label={`Ligar o ${frame.label.toLowerCase()} de ${macroName} a outra tela`}
            title="Ligar a outra tela"
            className="-mr-1 shrink-0 rounded-full p-1 text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
        <p className="truncate text-sm text-ink/55" title={shownName}>
          {shownName}
        </p>
        {follows && (
          <p className="flex items-start gap-1 text-sm text-ink/60">
            <Link2 size={14} aria-hidden className="mt-1 shrink-0" />
            <span>Segue {namesList.format(follows)}</span>
          </p>
        )}
        {alsoIn.length > 0 && (
          <p className="flex items-start gap-1 text-sm text-ink/60">
            <Link2 size={14} aria-hidden className="mt-1 shrink-0" />
            <span>Muda junto com {namesList.format(alsoIn)}</span>
          </p>
        )}
        {notice?.tone === "error" && (
          <DismissibleAlert variant="inline" onDismiss={onDismissNotice}>
            {notice.message}
          </DismissibleAlert>
        )}
        {/* Shown whenever a saved file is waiting, not just right after a send or an undo: both
            have to survive leaving the screen or restarting the app. */}
        {(slot.canUndo || slot.canRedo) && !staged && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {slot.canUndo && (
              <button
                type="button"
                onClick={onUndo}
                disabled={busy !== null}
                title="Volta o arquivo de antes da última troca"
                className={HISTORY_BUTTON_CLASSES}
              >
                <Undo2 size={14} aria-hidden />
                Desfazer
              </button>
            )}
            {slot.canRedo && (
              <button
                type="button"
                onClick={onRedo}
                disabled={busy !== null}
                title="Traz de volta o que você desfez"
                className={HISTORY_BUTTON_CLASSES}
              >
                <Redo2 size={14} aria-hidden />
                Refazer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Where a macro shows nothing in that role, so its card keeps the same shape as the others. */
export function EmptyScreen({ role }: { role: ScreenRole }) {
  const frame = ROLE_FRAME[role];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border-2 border-dashed border-line px-2 text-center text-sm text-ink/45",
          frame.aspect,
        )}
      >
        Sem {frame.label.toLowerCase()}
      </div>
    </div>
  );
}
