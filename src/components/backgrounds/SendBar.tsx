"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { SendProgress, SendSummary } from "@/lib/backgrounds/useDraftActions";
import { InlineMessage } from "@/components/ui/InlineMessage";

interface SendBarProps {
  stagedCount: number;
  progress: SendProgress | null;
  summary: SendSummary | null;
  onSend: () => void;
  onDiscard: () => void;
  onDismissSummary: () => void;
}

function FailureAlert({ failures, onDismiss }: { failures: string[]; onDismiss: () => void }) {
  return (
    <InlineMessage tone="error" onDismiss={onDismiss}>
      <p className="font-medium">
        {failures.length === 1 ? "Uma troca não deu." : `${failures.length} trocas não deram.`}
      </p>
      <ul>
        {[...new Set(failures)].map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </InlineMessage>
  );
}

/**
 * The screen's one decision, kept in reach however far down the macros go. Sticky rather than
 * fixed: scrolled to the bottom, it sits after the last macro instead of over it.
 */
export function SendBar({ stagedCount, progress, summary, onSend, onDiscard, onDismissSummary }: SendBarProps) {
  const failures = summary?.failures ?? [];
  let content: ReactNode;

  if (progress) {
    content = (
      <p className="flex items-center gap-2 text-base text-ink" role="status">
        <Loader2 size={18} className="shrink-0 animate-spin" aria-hidden />
        Enviando {Math.min(progress.done + 1, progress.total)} de {progress.total}…
      </p>
    );
  } else if (stagedCount > 0) {
    content = (
      // A narrow bar: count and "Descartar" on one row, "Enviar" full width under them. Sized by the
      // bar's own width (a container query), since the macros pane doesn't follow the window's.
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-3 @xl:grid-cols-[1fr_auto_auto]">
        {failures.length > 0 && (
          <div className="col-span-full">
            <FailureAlert failures={failures} onDismiss={onDismissSummary} />
          </div>
        )}
        <p className="min-w-0 text-base font-medium text-ink">
          {stagedCount} {stagedCount === 1 ? "troca pronta" : "trocas prontas"}
        </p>
        <Button variant="ghost" onClick={onDiscard}>
          Descartar
        </Button>
        <Button onClick={onSend} className="col-span-2 @xl:col-span-1">
          <Send size={16} aria-hidden />
          Enviar para o ProPresenter
        </Button>
      </div>
    );
  } else if (failures.length > 0) {
    content = <FailureAlert failures={failures} onDismiss={onDismissSummary} />;
  } else {
    content = (
      <div className="flex items-start gap-2 @xl:items-center">
        <p className="flex flex-1 items-start gap-2 text-base text-ink" role="status">
          <CheckCircle2 size={18} aria-hidden className="mt-1 shrink-0" />
          Pronto! Na próxima vez que a macro rodar, já aparece o novo.
        </p>
        <button
          type="button"
          onClick={onDismissSummary}
          aria-label="Fechar aviso"
          className="shrink-0 rounded-full p-0.5 text-ink/40 transition-colors hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Enviar trocas"
      className="@container sticky bottom-4 z-20 rounded-2xl border border-line bg-white px-4 py-3 shadow-lg"
    >
      {content}
    </div>
  );
}
