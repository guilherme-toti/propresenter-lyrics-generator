"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Clapperboard,
  Film,
  FolderSearch,
  Image as ImageIcon,
  Info,
  Loader2,
  RefreshCw,
  Settings,
} from "lucide-react";
import { useAppShellActions } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { slotPreviewUrl, trayPreviewUrl } from "@/lib/backgrounds/api";
import { useBackgroundsDraft } from "@/lib/backgrounds/draftStore";
import {
  activeLinks,
  changeGroup,
  followersOf,
  macroNamesShowing,
  otherMacrosChanged,
  type ScreenLinks,
} from "@/lib/backgrounds/links";
import { useBackgroundsOverview } from "@/lib/backgrounds/useBackgroundsOverview";
import { useDetectProPresenterFolder } from "@/lib/backgrounds/useDetectProPresenterFolder";
import { useDraftActions } from "@/lib/backgrounds/useDraftActions";
import { useNativeFileDrop } from "@/lib/backgrounds/useNativeFileDrop";
import { useTrayPointerDrag } from "@/lib/backgrounds/useTrayPointerDrag";
import { useDesktopStore } from "@/lib/desktopStore";
import type { BackgroundsOverview, MacroMedia } from "@/lib/propresenter/backgrounds/slots";
import { ClearScreenButton } from "./ClearScreenButton";
import { DismissibleAlert } from "./DismissibleAlert";
import { LinkScreenModal, type LinkedScreen, type LinkTarget } from "./LinkScreenModal";
import { MacroCard } from "./MacroCard";
import { MediaTray } from "./MediaTray";
import { refusalLabel, ScreenFrame, type FrameDragState, type ScreenRole } from "./ScreenFrame";
import { SendBar } from "./SendBar";

function linkedScreen(slotId: string, overview: BackgroundsOverview): LinkedScreen {
  return {
    slotId,
    macroNames: macroNamesShowing(slotId, overview.macros),
    fileName: overview.slots.find((slot) => slot.id === slotId)?.fileName ?? "",
  };
}

/** Screens the target could follow: the same role (a background follows a background) and kind of
 * file, so a staged file fits both, and not following another screen themselves. */
function linkCandidates(target: LinkTarget, overview: BackgroundsOverview, links: ScreenLinks): LinkedScreen[] {
  const mediaType = overview.slots.find((slot) => slot.id === target.slotId)?.mediaType;
  const slotIds = new Set(
    overview.macros.flatMap((macro) => (target.role === "background" ? macro.backgrounds : macro.props)),
  );
  return [...slotIds]
    .filter((slotId) => slotId !== target.slotId && links[slotId] === undefined)
    .filter((slotId) => overview.slots.find((slot) => slot.id === slotId)?.mediaType === mediaType)
    .map((slotId) => linkedScreen(slotId, overview));
}

const GHOST_OFFSET_PX = 14;
/** Closer than this to the bottom, the tag goes above the pointer instead of below it. */
const GHOST_FLIP_BOTTOM_PX = 80;

/** Beside the pointer, on whichever side has room, so the tag never runs off the window. */
function ghostTransform(x: number, y: number): string {
  const offset = (flip: boolean) => (flip ? `calc(-100% - ${GHOST_OFFSET_PX}px)` : `${GHOST_OFFSET_PX}px`);
  return `translate(${offset(x > window.innerWidth / 2)}, ${offset(y > window.innerHeight - GHOST_FLIP_BOTTOM_PX)})`;
}

function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-20 text-center">
      <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-cream-200 text-ink/70">{icon}</span>
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      <p className="text-base text-ink/60 sm:text-sm">{children}</p>
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

function LoadingLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 py-20 text-base text-ink/55 sm:text-sm">
      <Loader2 size={16} className="animate-spin" aria-hidden />
      {children}
    </p>
  );
}

/**
 * Sets what each of ProPresenter's macros shows: the week's files go into a tray, get dragged onto
 * each macro's screens, and go out together with one "Enviar". The macro itself is never touched:
 * overwriting the file it points to is enough for the next trigger to show the new one.
 */
export function BackgroundsScreen() {
  const folder = useDesktopStore((s) => s.proPresenterFolder);
  const port = useDesktopStore((s) => s.proApiPort);
  const savedLinks = useDesktopStore((s) => s.backgroundLinks);
  const setBackgroundLink = useDesktopStore((s) => s.setBackgroundLink);
  const detecting = useDetectProPresenterFolder();
  const { openSettings } = useAppShellActions();
  const overviewState = useBackgroundsOverview(folder);
  const { overview, error, loading, reload } = overviewState;
  const draft = useBackgroundsDraft();
  const actions = useDraftActions(folder, overviewState);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [linkTarget, setLinkTarget] = useState<LinkTarget | null>(null);
  // The last macro run from here. It puts every file it uses on screen, so its card says so.
  const [onScreenMacroUuid, setOnScreenMacroUuid] = useState<string | null>(null);

  const nativeDrag = useNativeFileDrop((paths, slotId) => void actions.dropFiles(paths, slotId));
  const trayDrag = useTrayPointerDrag((trayFileId, slotId) => actions.stageOn(slotId, trayFileId));

  const { selectedTrayFileId, selectTrayFile } = draft;
  useEffect(() => {
    if (!selectedTrayFileId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") selectTrayFile(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTrayFileId, selectTrayFile]);

  const openSettingsButton = (variant: "secondary" | "ghost") => (
    <Button variant={variant} onClick={openSettings}>
      <Settings size={16} aria-hidden />
      Abrir Ajustes
    </Button>
  );

  if (!folder) {
    if (detecting) return <LoadingLine>Procurando a pasta do ProPresenter…</LoadingLine>;
    return (
      <EmptyState
        icon={<FolderSearch size={26} aria-hidden />}
        title="Falta a pasta do ProPresenter"
        action={openSettingsButton("secondary")}
      >
        Escolha em Ajustes a pasta onde o ProPresenter guarda as macros. Depois é só voltar aqui.
      </EmptyState>
    );
  }

  if (!overview) {
    if (error) {
      return (
        <EmptyState
          icon={<AlertCircle size={26} aria-hidden />}
          title="Não deu pra ler as macros"
          action={
            <>
              {openSettingsButton("secondary")}
              <Button variant="secondary" onClick={reload}>
                <RefreshCw size={16} aria-hidden />
                Tentar de novo
              </Button>
            </>
          }
        >
          {error}
        </EmptyState>
      );
    }
    return <LoadingLine>Lendo as macros…</LoadingLine>;
  }

  const refreshButton = (
    <Button variant="ghost" onClick={reload} disabled={loading}>
      <RefreshCw size={16} aria-hidden className={loading ? "animate-spin" : undefined} />
      Atualizar
    </Button>
  );

  if (overview.macros.length === 0) {
    return (
      <EmptyState
        icon={<Clapperboard size={26} aria-hidden />}
        title="Nenhuma macro com fundo ou prop"
        action={refreshButton}
      >
        Crie no ProPresenter uma macro que mostre um fundo ou um prop. Depois, clique em “Atualizar”.
      </EmptyState>
    );
  }

  const slotById = new Map(overview.slots.map((slot) => [slot.id, slot]));
  const trayById = new Map(draft.tray.map((file) => [file.id, file]));
  // A change staged for a file the macros no longer show is left out rather than sent.
  const stagedSlotIds = Object.keys(draft.staged).filter((slotId) => slotById.has(slotId));
  // Screens, not slots: the logo Início and Fim share is one slot shown on two screens.
  const useCounts: Record<string, number> = {};
  for (const slotId of stagedSlotIds) {
    const trayFileId = draft.staged[slotId].trayFileId;
    const screens = overview.macros.reduce(
      (count, macro) => count + [...macro.backgrounds, ...macro.props].filter((id) => id === slotId).length,
      0,
    );
    useCounts[trayFileId] = (useCounts[trayFileId] ?? 0) + screens;
  }

  const draggedOverSlotId = trayDrag.drag?.overSlotId ?? nativeDrag?.overSlotId ?? null;
  const dragging = trayDrag.drag !== null || nativeDrag !== null;
  const links = activeLinks(savedLinks, overview.slots);
  const highlighted = new Set(draggedOverSlotId ? changeGroup(draggedOverSlotId, links) : []);
  const dragStateFor = (slotId: string): FrameDragState => {
    if (!dragging) return "none";
    return highlighted.has(slotId) ? "here" : "elsewhere";
  };
  const armed = draft.selectedTrayFileId !== null && !dragging;
  // The tray file being dragged or picked, so screens it can't go on say so before it's dropped.
  // None while files come in from Finder or Explorer: what they are is only known on the drop.
  const heldFile = nativeDrag ? undefined : trayById.get(trayDrag.drag?.trayFileId ?? draft.selectedTrayFileId ?? "");
  const draggedFile = trayDrag.drag ? heldFile : undefined;

  const renderFrame = (macro: MacroMedia, slotId: string, role: ScreenRole) => {
    const slot = slotById.get(slotId);
    if (!slot) return null;
    const change = draft.staged[slotId];
    const stagedFile = change ? trayById.get(change.trayFileId) : undefined;
    const busy = actions.historySteps.get(slotId) ?? (actions.progress && change ? "sending" : null);
    return (
      <ScreenFrame
        key={`${role}-${slotId}`}
        role={role}
        macroName={macro.macroName}
        slot={slot}
        previewSrc={slotPreviewUrl(folder, slot)}
        staged={stagedFile ? { file: stagedFile, src: trayPreviewUrl(stagedFile.id) } : null}
        notice={draft.notices[slotId] ?? null}
        alsoIn={otherMacrosChanged(macro.macroUuid, slotId, overview.macros, links)}
        follows={links[slotId] ? macroNamesShowing(links[slotId], overview.macros) : null}
        dragState={dragStateFor(slotId)}
        armed={armed}
        refusal={heldFile ? refusalLabel(slot, heldFile.fileName) : null}
        heldPreview={draggedFile ? { src: trayPreviewUrl(draggedFile.id), file: draggedFile } : null}
        busy={busy}
        onActivate={() => {
          if (draft.selectedTrayFileId) actions.stageOn(slotId, draft.selectedTrayFileId);
          else void actions.pickForSlot(slotId);
        }}
        onUnstage={() => draft.unstage(slotId)}
        onUndo={() => void actions.undo(slotId)}
        onRedo={() => void actions.redo(slotId)}
        onDismissNotice={() => draft.setNotice(slotId, null)}
        onEditLink={() => setLinkTarget({ slotId, role, macroName: macro.macroName })}
      />
    );
  };

  const sendBarVisible = stagedSlotIds.length > 0 || actions.progress !== null || actions.summary !== null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <h1 className="font-display text-2xl font-semibold text-ink">Backgrounds</h1>
          <p className="mt-1 text-base text-ink/60 sm:text-sm">
            Solte os arquivos da semana e arraste cada um até a tela da macro. O ProPresenter só muda quando você
            enviar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {refreshButton}
          <ClearScreenButton port={port} onCleared={() => setOnScreenMacroUuid(null)} onError={setScreenError} />
        </div>
      </header>

      {!port && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-cream-100 px-4 py-3 sm:flex-row sm:items-center">
          <Info size={18} aria-hidden className="shrink-0 text-ink/60" />
          <p className="flex-1 text-base text-ink/75 sm:text-sm">
            Pra testar as macros daqui, informe a porta do ProPresenter em Ajustes.
          </p>
          {openSettingsButton("ghost")}
        </div>
      )}

      {screenError && <DismissibleAlert onDismiss={() => setScreenError(null)}>{screenError}</DismissibleAlert>}

      <MediaTray
        tray={draft.tray}
        selectedId={draft.selectedTrayFileId}
        draggingId={trayDrag.drag?.trayFileId ?? null}
        receivingFiles={nativeDrag !== null && nativeDrag.overSlotId === null}
        useCounts={useCounts}
        refusals={actions.trayRefusals}
        error={actions.trayError}
        onPick={() => void actions.pickForTray()}
        onSelect={(trayFileId) => selectTrayFile(draft.selectedTrayFileId === trayFileId ? null : trayFileId)}
        onRemove={draft.removeFromTray}
        onDismissMessages={actions.dismissTrayMessages}
        pointerHandlersFor={trayDrag.handlersFor}
        clickGuard={trayDrag.clickGuard}
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {overview.macros.map((macro) => (
          <MacroCard
            key={macro.macroUuid}
            macro={macro}
            port={port}
            onScreen={macro.macroUuid === onScreenMacroUuid}
            onShown={setOnScreenMacroUuid}
            renderFrame={(slotId, role) => renderFrame(macro, slotId, role)}
          />
        ))}
      </div>

      <LinkScreenModal
        target={linkTarget}
        candidates={linkTarget ? linkCandidates(linkTarget, overview, links) : []}
        leaderSlotId={linkTarget ? (links[linkTarget.slotId] ?? null) : null}
        followers={linkTarget ? followersOf(linkTarget.slotId, links).map((id) => linkedScreen(id, overview)) : []}
        onFollow={(leaderSlotId) => {
          if (linkTarget) setBackgroundLink(linkTarget.slotId, leaderSlotId);
          setLinkTarget(null);
        }}
        // Closes, rather than switching to the list of screens to follow: that list would land a
        // row under the pointer, and a double-click would link the two the other way round.
        onUnlinkFollower={(followerSlotId) => {
          setBackgroundLink(followerSlotId, null);
          setLinkTarget(null);
        }}
        onClose={() => setLinkTarget(null)}
      />

      {sendBarVisible && (
        <SendBar
          stagedCount={stagedSlotIds.length}
          progress={actions.progress}
          summary={actions.summary}
          onSend={() => void actions.send()}
          onDiscard={actions.discard}
          onDismissSummary={actions.dismissSummary}
        />
      )}

      {trayDrag.drag && draggedFile && !trayDrag.drag.overSlotId && (
        // A name tag beside the pointer between screens. Over a screen it goes away, since the
        // screen itself then shows the file. pointer-events-none keeps it out of the hit test
        // that finds the screen underneath. At most half the window wide, so it fits on the side
        // it's flipped to.
        <div
          aria-hidden
          className="pointer-events-none fixed z-30 inline-flex max-w-[min(14rem,calc(50vw-1.5rem))] items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-cream-50 shadow-xl"
          style={{ left: trayDrag.drag.x, top: trayDrag.drag.y, transform: ghostTransform(trayDrag.drag.x, trayDrag.drag.y) }}
        >
          {draggedFile.mediaType === "video" ? <Film size={14} aria-hidden /> : <ImageIcon size={14} aria-hidden />}
          <span className="truncate">{draggedFile.fileName}</span>
        </div>
      )}
    </div>
  );
}
