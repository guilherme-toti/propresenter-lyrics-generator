"use client";

import { Fragment, useState, type ReactNode } from "react";
import { CheckCircle2, Copy, Film, Loader2, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { Modal } from "@/components/ui/Modal";
import { separateBackgroundSlot } from "@/lib/backgrounds/api";
import { encodeStillVideo } from "@/lib/backgrounds/stillVideo";
import { toBase64 } from "@/lib/backgrounds/stillVideoFrames";
import { errorMessage } from "@/lib/postJson";
import type { SeparateSlotReply } from "@/lib/propresenter/backgrounds/contracts";
import type { FileManager } from "@/lib/propresenter/backgrounds/contracts";
import type { ScreenRole } from "@/lib/propresenter/backgrounds/requests";


const namesList = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

const SCREEN_NAME: Record<ScreenRole, string> = { background: "a tela central", prop: "a tela lateral" };

const FILE_MANAGER_NAME: Record<FileManager, string> = {
  finder: "no Finder",
  explorer: "no Explorador de Arquivos",
};

/** The new file is "a cópia" (feminine) or "o vídeo" (masculine), and the sentences agree with it. */
interface NewFileWords {
  button: string;
  icon: LucideIcon;
  made: string;
  /** "Ela já está selecionada…" */
  it: string;
  selected: string;
  ready: string;
  /** "…troque a mídia dela por essa cópia" */
  this: string;
}

const COPY_WORDS: NewFileWords = {
  button: "Fazer a cópia",
  icon: Copy,
  made: "Cópia feita",
  it: "Ela",
  selected: "selecionada",
  ready: "pronta",
  this: "essa cópia",
};

const VIDEO_WORDS: NewFileWords = {
  button: "Fazer o vídeo",
  icon: Film,
  made: "Vídeo feito",
  it: "Ele",
  selected: "selecionado",
  ready: "pronto",
  this: "esse vídeo",
};

export interface SeparateTarget {
  slotId: string;
  role: ScreenRole;
  macroUuid: string;
  macroName: string;
  fileName: string;
  /** The other macros showing the same file. */
  sharedWith: string[];
  /** "Virar vídeo": the new file is the screen's image as a still video, not a copy. */
  asVideo: boolean;
  /** The screen's file as it is now, which "Virar vídeo" turns into the video. */
  previewSrc: string;
}

interface SeparateScreenModalProps {
  folder: string;
  target: SeparateTarget;
  onClose: () => void;
  /** Reads the macros again, so a screen pointed at its new file shows up on its own. */
  onRefresh: () => void;
}

/** The names in bold, the "e" and commas between them not. */
function NameList({ names }: { names: string[] }) {
  return namesList.formatToParts(names).map((part, index) => (
    <Fragment key={index}>{part.type === "element" ? <strong>{part.value}</strong> : part.value}</Fragment>
  ));
}

function Step({ marker, children }: { marker: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cream-200 text-sm font-semibold text-ink">
        {marker}
      </span>
      <p className="pt-0.5 text-sm text-ink/80">{children}</p>
    </li>
  );
}

/** What to do in ProPresenter so the macro shows its new file. A prop another macro also shows
 * can't just get a new file: that would change the other macro too, so this one needs a prop of
 * its own. A video also has to loop, or it stops at its end. */
function pointingStep(target: SeparateTarget, prop: SeparateSlotReply["prop"], words: NewFileWords): ReactNode {
  const macro = <strong>{target.macroName}</strong>;
  const loop = target.asVideo ? " e deixe ele repetindo (loop)" : "";
  if (target.role === "background") {
    return (
      <>
        No ProPresenter, edite a macro {macro}, troque a mídia dela por {words.this}
        {loop}.
      </>
    );
  }
  const propName = prop?.name ? <strong>{prop.name}</strong> : "o prop dela";
  if (prop && prop.sharedWith.length > 0) {
    return (
      <>
        {macro} mostra {propName}, que <NameList names={prop.sharedWith} /> também mostra. No ProPresenter, duplique
        esse prop, ponha {words.this} como mídia do prop novo{target.asVideo ? ", repetindo (loop)," : ""} e, na macro{" "}
        {macro}, troque o prop antigo pelo novo.
      </>
    );
  }
  return (
    <>
      No ProPresenter, edite {propName}, troque a mídia dele por {words.this}
      {loop}.
    </>
  );
}

function Intro({ target }: { target: SeparateTarget }) {
  const macro = <strong>{target.macroName}</strong>;
  const file = <strong>{target.fileName}</strong>;
  if (!target.asVideo) {
    return (
      <>
        <p className="text-sm text-ink/80">
          Hoje {macro} usa o mesmo arquivo que <NameList names={target.sharedWith} />. Por isso, trocar um troca todos.
        </p>
        <p className="text-sm text-ink/80">
          O app faz uma cópia de {file} só pra {macro}. Depois, você aponta a macro pra ela no ProPresenter, uma vez
          só.
        </p>
      </>
    );
  }
  return (
    <>
      <p className="text-sm text-ink/80">
        Hoje essa tela mostra uma imagem, e por isso só aceita imagens. Como vídeo, ela aceita os dois: as imagens o
        app transforma em vídeo sozinho.
      </p>
      <p className="text-sm text-ink/80">
        O app faz um vídeo de {file} só pra {macro}. Depois, você aponta a macro pra ele no ProPresenter, uma vez só.
        {target.sharedWith.length > 0 && (
          <>
            {" "}
            De quebra, essa tela para de mudar junto com <NameList names={target.sharedWith} />.
          </>
        )}
      </p>
    </>
  );
}

/**
 * Gives one macro's screen a file of its own, made by the app: "Separar" copies a file other macros
 * share, so changing it stops changing them; "Virar vídeo" turns an image screen's picture into a
 * still video, so the screen can take videos too. Pointing the macro at the new file happens in
 * ProPresenter, once, since the app never edits ProPresenter's macros.
 */
export function SeparateScreenModal({ folder, target, onClose, onRefresh }: SeparateScreenModalProps) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<SeparateSlotReply | null>(null);
  const words = target.asVideo ? VIDEO_WORDS : COPY_WORDS;
  const ActionIcon = words.icon;
  const title = target.asVideo
    ? `Deixar ${SCREEN_NAME[target.role]} de ${target.macroName} como vídeo`
    : `Separar ${SCREEN_NAME[target.role]} de ${target.macroName}`;

  const create = async () => {
    setWorking(true);
    setError(null);
    try {
      const video = target.asVideo ? toBase64(await encodeStillVideo(target.previewSrc)) : undefined;
      setReply(
        await separateBackgroundSlot({
          folder,
          slotId: target.slotId,
          macroUuid: target.macroUuid,
          role: target.role,
          video,
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={title} className="max-w-lg">
      {reply ? (
        <div className="flex flex-col gap-5">
          <ol className="flex flex-col gap-3">
            <Step marker={<CheckCircle2 size={16} aria-hidden />}>
              {words.made}: <strong>{reply.fileName}</strong>.{" "}
              {reply.revealedIn
                ? `${words.it} já está ${words.selected} ${FILE_MANAGER_NAME[reply.revealedIn]}, ${words.ready} pra arrastar.`
                : `${words.it} está na mesma pasta do arquivo de hoje.`}
            </Step>
            <Step marker="2">{pointingStep(target, reply.prop, words)}</Step>
            <Step marker="3">
              Volte aqui e clique em <strong>Atualizar</strong>. Daí essa tela passa a{" "}
              {target.asVideo ? "aceitar imagens e vídeos" : "mudar sozinha"}.
            </Step>
          </ol>
          {/* Closing without reloading is the header's X. */}
          <div className="flex justify-end">
            <Button
              onClick={() => {
                onRefresh();
                onClose();
              }}
            >
              <RefreshCw size={16} aria-hidden />
              Atualizar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Intro target={target} />
          {error && <InlineMessage tone="error">{error}</InlineMessage>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => void create()} disabled={working}>
              {working ? <Loader2 size={16} aria-hidden className="animate-spin" /> : <ActionIcon size={16} aria-hidden />}
              {words.button}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
