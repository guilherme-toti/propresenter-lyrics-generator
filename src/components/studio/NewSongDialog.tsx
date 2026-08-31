"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, PenLine, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";

interface NewSongDialogProps {
  open: boolean;
  onClose: () => void;
}

type Step = "choose" | "ai";

export function NewSongDialog({ open, onClose }: NewSongDialogProps) {
  const [step, setStep] = useState<Step>("choose");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createSong = useLibraryStore((s) => s.createSong);

  const reset = () => {
    setStep("choose");
    setQuery("");
    setError(null);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleManual = () => {
    createSong({ mode: "manual" });
    handleClose();
  };

  const handleGenerate = async () => {
    if (query.trim().length < 2) {
      setError("Digite o título de uma música, um trecho da letra ou uma breve descrição.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Algo deu errado.");
      }
      createSong(data.song as Song);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo deu errado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Novo projeto">
      {step === "choose" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => setStep("ai")}
            className="group flex flex-col items-start gap-2 rounded-xl border-2 border-accent/50 bg-accent/5 p-4 text-left transition-colors hover:border-accent"
          >
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Recomendado
            </span>
            <span className="mt-1 flex items-center gap-2 font-display text-base font-semibold text-ink">
              <Sparkles size={16} className="text-accent" />
              Gerar com IA
            </span>
            <span className="text-xs text-ink/60">
              Digite um título, um trecho da letra ou uma descrição. Vamos encontrar a música e sua tradução, e
              alinhar tudo para você.
            </span>
          </button>

          <button
            onClick={handleManual}
            className="flex flex-col items-start gap-2 rounded-xl border border-line bg-white p-4 text-left transition-colors hover:border-ink/30"
          >
            <span className="flex items-center gap-2 font-display text-base font-semibold text-ink">
              <PenLine size={16} className="text-ink/60" />
              Criar manualmente
            </span>
            <span className="text-xs text-ink/60">
              Cole a letra de cada idioma você mesmo e alinhe linha por linha.
            </span>
          </button>
        </div>
      )}

      {step === "ai" && (
        <div className="space-y-4">
          <button
            onClick={() => setStep("choose")}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink/50 hover:text-ink"
          >
            <ArrowLeft size={13} />
            Voltar
          </button>

          <div>
            <Label htmlFor="ai-query">Título da música, trecho da letra ou descrição</Label>
            <Input
              id="ai-query"
              autoFocus
              placeholder={'ex.: "Oceans (Where Feet May Fail), do Hillsong" ou algumas linhas da letra'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            />
            <p className="mt-1.5 text-xs text-ink/45">
              Vamos parear automaticamente com português (Brasil) e inglês.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button onClick={handleGenerate} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Buscando a música…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Gerar
              </>
            )}
          </Button>
        </div>
      )}
    </Modal>
  );
}
