"use client";

import { ArrowDownToLine, Ban, Check, Files, Film, Loader2, Redo2, Sparkles, Split, Undo2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { slotDropTargetProps } from "@/lib/backgrounds/dropTargets";
import type { ScreenNotice } from "@/lib/backgrounds/draftStore";
import type { HistoryStep } from "@/lib/backgrounds/useDraftActions";
import { planReplacement } from "@/lib/propresenter/backgrounds/media";
import type { ScreenRole } from "@/lib/propresenter/backgrounds/requests";
import type { MediaSlot } from "@/lib/propresenter/backgrounds/slots";
import type { TrayFile } from "@/lib/propresenter/backgrounds/tray";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { MediaPreview } from "./MediaPreview";

/** "elsewhere" while a file is being dragged but not over this screen (or another screen showing
 * the same file); "here" when it is. */
export type FrameDragState = "none" | "elsewhere" | "here";

/** The church's central screen is 16:9 and its side panels are tall; files come ready for them.
 * `name` goes after "a"/"na" in what's read out ("Trocar a tela central de WELCOME"). */
const ROLE_FRAME: Record<ScreenRole, { label: string; name: string; aspect: string; sizes: string }> = {
  background: { label: "Central", name: "tela central", aspect: "aspect-video", sizes: "480px" },
  prop: { label: "Lateral", name: "tela lateral", aspect: "aspect-[9/16]", sizes: "160px" },
};

const namesList = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

/** A few words for the screen itself, while a file that can't go there is held over it. The full
 * reason shows under the screen if it's dropped anyway. */
export function refusalLabel(slot: MediaSlot, fileName: string): string | null {
  const plan = planReplacement(slot, fileName);
  if (plan.action !== "refuse") return null;
  // Only a video onto an image screen: an image onto a video screen becomes a video.
  if (plan.reason === "media-mismatch") return "Aqui vai uma imagem";
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
  /** The other macros showing this same file, which a change here changes too. */
  sharedWith: string[];
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
  /** Gives this macro's screen a file of its own. */
  onSeparate: () => void;
  /** Gives this image screen its image as a still video, to set it up as a video in ProPresenter. */
  onTurnIntoVideo: () => void;
}

/** One of a macro's screens: what it shows now, or the file staged for it. */
export function ScreenFrame({
  role,
  macroName,
  slot,
  previewSrc,
  staged,
  notice,
  sharedWith,
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
  onSeparate,
  onTurnIntoVideo,
}: ScreenFrameProps) {
  const frame = ROLE_FRAME[role];
  const shownName = staged?.file.fileName ?? slot.fileName;
  const becomesVideo = staged !== null && planReplacement(slot, staged.file.fileName).action === "encode-video";
  const canTurnIntoVideo = slot.mediaType === "image" && slot.exists;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative">
        <button
          type="button"
          {...slotDropTargetProps(slot.id)}
          onClick={onActivate}
          disabled={busy !== null}
          aria-label={armed ? `Pôr o arquivo escolhido na ${frame.name} de ${macroName}` : `Trocar a ${frame.name} de ${macroName}`}
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
              aria-label={`Manter a ${frame.name} atual de ${macroName}`}
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
        <p className="text-sm font-medium text-ink">{frame.label}</p>
        {/* Whole, wrapped: a copy "Separar" made ends in its macro's name, which a cut-off name
            would hide in the narrow lateral column. */}
        <p className="break-words text-sm text-ink/55">{shownName}</p>
        {becomesVideo && (
          <p className="flex items-start gap-1 text-sm text-ink/60">
            <Film size={14} aria-hidden className="mt-1 shrink-0" />
            <span className="min-w-0">Vira vídeo ao enviar</span>
          </p>
        )}
        {sharedWith.length > 0 && (
          <p className="flex items-start gap-1 text-sm text-ink/60" title="Trocar aqui troca nessas também">
            <Files size={14} aria-hidden className="mt-1 shrink-0" />
            {/* min-w-0 and break-words: a long macro name in the narrow lateral column wraps
                instead of running past it. */}
            <span className="min-w-0 break-words">Mesmo arquivo de {namesList.format(sharedWith)}</span>
          </p>
        )}
        {(sharedWith.length > 0 || canTurnIntoVideo) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {sharedWith.length > 0 && (
              <button
                type="button"
                onClick={onSeparate}
                disabled={busy !== null}
                title="Dá a esta tela um arquivo só dela"
                className={HISTORY_BUTTON_CLASSES}
              >
                <Split size={14} aria-hidden />
                Separar
              </button>
            )}
            {canTurnIntoVideo && (
              <button
                type="button"
                onClick={onTurnIntoVideo}
                disabled={busy !== null}
                title="Deixa esta tela como vídeo, pra ela aceitar imagens e vídeos"
                className={HISTORY_BUTTON_CLASSES}
              >
                <Film size={14} aria-hidden />
                Virar vídeo
              </button>
            )}
          </div>
        )}
        {notice?.tone === "error" && (
          <InlineMessage tone="error" onDismiss={onDismissNotice}>
            {notice.message}
          </InlineMessage>
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

/** Where a macro shows nothing in that role, so its row keeps the same shape as the others. */
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
        Sem {frame.name}
      </div>
    </div>
  );
}
