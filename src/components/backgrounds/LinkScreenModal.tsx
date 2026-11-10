"use client";

import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PickRow } from "@/components/ui/PickRow";
import type { ScreenRole } from "./ScreenFrame";

const ROLE_WORDS: Record<ScreenRole, { label: string; this: string }> = {
  background: { label: "Fundo", this: "este fundo" },
  prop: { label: "Prop", this: "este prop" },
};

const namesList = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });

export interface LinkTarget {
  slotId: string;
  role: ScreenRole;
  macroName: string;
}

/** A screen, by its slot: several macros can show the same file. */
export interface LinkedScreen {
  slotId: string;
  macroNames: string[];
  fileName: string;
}

interface LinkScreenModalProps {
  target: LinkTarget | null;
  /** Screens the target could follow: same role and kind of file, and not following another. */
  candidates: LinkedScreen[];
  /** The slot the target follows now, if any. */
  leaderSlotId: string | null;
  /** Screens following the target. A followed screen can't follow another one itself. */
  followers: LinkedScreen[];
  onFollow: (leaderSlotId: string | null) => void;
  onUnlinkFollower: (followerSlotId: string) => void;
  onClose: () => void;
}

/** Links one screen to another, so a file dropped on the followed screen goes on this one too.
 * Meant for a background ProPresenter shows again with an effect, like Palavra and Palavra Bíblia. */
export function LinkScreenModal({
  target,
  candidates,
  leaderSlotId,
  followers,
  onFollow,
  onUnlinkFollower,
  onClose,
}: LinkScreenModalProps) {
  if (!target) return null;
  const words = ROLE_WORDS[target.role];

  return (
    <Modal open onClose={onClose} title={`${words.label} de ${target.macroName}`} className="max-w-lg">
      {followers.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-base text-ink/75 sm:text-sm">
            Quando você troca {words.this}, estas telas mudam junto. Uma tela seguida não pode seguir outra.
          </p>
          <ul className="flex flex-col gap-2">
            {followers.map((follower) => (
              <li
                key={follower.slotId}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
                  <Link2 size={14} aria-hidden className="shrink-0 text-ink/50" />
                  <span className="truncate">{namesList.format(follower.macroNames)}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => onUnlinkFollower(follower.slotId)}>
                  Desligar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-base text-ink/75 sm:text-sm">
            Escolha a tela que {words.this} segue. Quando você trocar aquela, esta muda junto. Dá pra trocar esta
            sozinha quando quiser.
          </p>
          {candidates.length === 0 ? (
            <p className="text-sm text-ink/55">Nenhuma outra tela mostra o mesmo tipo de arquivo.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {candidates.map((candidate) => (
                <PickRow
                  key={candidate.slotId}
                  title={namesList.format(candidate.macroNames)}
                  subtitle={candidate.fileName}
                  trailing={candidate.slotId === leaderSlotId ? "Seguindo" : undefined}
                  onClick={() => onFollow(candidate.slotId)}
                />
              ))}
            </div>
          )}
          {leaderSlotId && (
            <div>
              <Button variant="secondary" onClick={() => onFollow(null)}>
                Não seguir mais
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
