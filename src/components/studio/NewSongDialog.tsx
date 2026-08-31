"use client";

import { useState } from "react";
import { Loader2, PenLine, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";

interface NewSongDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewSongDialog({ open, onClose }: NewSongDialogProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createSong = useLibraryStore((s) => s.createSong);

  const reset = () => {
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
      <div className="space-y-4">
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

        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleManual} className="flex-1">
            <PenLine size={16} />
            Criar manualmente
          </Button>
          <Button onClick={handleGenerate} disabled={loading} className="flex-1">
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Buscando a música…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Gerar com IA
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
