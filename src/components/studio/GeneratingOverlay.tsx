"use client";

import { useEffect, useState } from "react";
import { AlertCircle, PenLine } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Deliberately vague about direction: a song can be generated either way round (an English
// song gets a Português version, a Brazilian one gets English), so naming a target language
// here would be wrong half the time.
const STATUS_MESSAGES = [
  "Procurando a música…",
  "Conferindo a letra original…",
  "Traduzindo…",
  "Alinhando linha por linha…",
  "Quase lá…",
];

const STATUS_INTERVAL_MS = 2200;

/** Each bar gets its own duration/delay so they bounce out of sync, like a real audio meter. */
const BARS = [
  { duration: 1.0, delay: 0 },
  { duration: 1.3, delay: 0.15 },
  { duration: 0.9, delay: 0.3 },
  { duration: 1.2, delay: 0.05 },
  { duration: 1.05, delay: 0.2 },
];

function Equalizer() {
  return (
    <div className="flex h-16 items-end gap-1.5">
      {BARS.map((bar, i) => (
        <div
          key={i}
          className="w-2.5 rounded-full bg-accent"
          style={{ animation: `equalize ${bar.duration}s ease-in-out ${bar.delay}s infinite` }}
        />
      ))}
    </div>
  );
}

interface GeneratingOverlayProps {
  query: string;
  error: string | null;
  onDismiss: () => void;
  onCreateManually: () => void;
}

export function GeneratingOverlay({ query, error, onDismiss, onCreateManually }: GeneratingOverlayProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (error) return;
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % STATUS_MESSAGES.length);
    }, STATUS_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [error]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertCircle size={22} />
        </div>
        <h2 className="font-display text-2xl font-semibold text-ink">Não foi dessa vez</h2>
        <p className="max-w-sm text-sm text-ink/55">{error}</p>
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" onClick={onDismiss}>
            Fechar
          </Button>
          {/* The way out of a song the AI can't find: this failure is otherwise a dead end. */}
          <Button variant="primary" onClick={onCreateManually}>
            <PenLine size={16} />
            Criar manualmente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <Equalizer />
      <div>
        <h2 className="font-display text-2xl font-semibold text-ink">
          Gerando <span className="text-accent">&quot;{query}&quot;</span>
        </h2>
        <p className="mt-2 text-sm text-ink/55">{STATUS_MESSAGES[messageIndex]}</p>
      </div>
    </div>
  );
}
