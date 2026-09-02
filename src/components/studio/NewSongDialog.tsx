"use client";

import { useState } from "react";
import { PenLine, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { useLibraryStore } from "@/lib/store";
import { useGenerateSong } from "@/lib/useGenerateSong";
import { useGenerationStore } from "@/lib/generationStore";

const MIN_QUERY_LENGTH = 2;

interface NewSongDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewSongDialog({ open, onClose }: NewSongDialogProps) {
  const [query, setQuery] = useState("");
  const createSong = useLibraryStore((s) => s.createSong);
  const { generate } = useGenerateSong();
  const startGeneration = useGenerationStore((s) => s.start);
  const failGeneration = useGenerationStore((s) => s.fail);
  const finishGeneration = useGenerationStore((s) => s.finish);

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  const handleManual = () => {
    createSong({ mode: "manual" });
    handleClose();
  };

  const canGenerate = query.trim().length >= MIN_QUERY_LENGTH;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    const trimmed = query.trim();

    // Close the dialog and switch straight to the full-screen overlay — same
    // flow the quick-add popup hands off to, instead of a spinner inside this
    // modal (createSong() below sets it as the active song on success, so
    // StudioShell already lands on it once the overlay clears).
    startGeneration(trimmed);
    handleClose();

    const result = await generate(trimmed);
    if ("id" in result) {
      finishGeneration();
    } else {
      failGeneration(result.error);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Nova música">
      <div className="space-y-4">
        <div>
          <Label htmlFor="ai-query">
            Título da música, trecho da letra ou descrição
          </Label>
          <Input
            id="ai-query"
            autoFocus
            placeholder={
              'ex.: "Oceans da banda Hillsong" ou algumas linhas da letra'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleGenerate()}
          />
          <p className="mt-1.5 text-xs text-ink/45">
            Vamos parear automaticamente com português (Brasil) e inglês.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleManual} className="flex-1">
            <PenLine size={16} />
            Criar manualmente
          </Button>
          <Button onClick={handleGenerate} disabled={!canGenerate} className="flex-1">
            <Sparkles size={16} />
            Gerar com IA
          </Button>
        </div>
      </div>
    </Modal>
  );
}
