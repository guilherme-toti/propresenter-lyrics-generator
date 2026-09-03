"use client";

import { useState } from "react";
import { Loader2, PenLine, Search, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { useLibraryStore } from "@/lib/store";
import { useGenerateSong } from "@/lib/useGenerateSong";
import { useGenerationStore } from "@/lib/generationStore";
import type { TrackCandidate } from "@/lib/lyrics/musixmatch";

const MIN_QUERY_LENGTH = 2;

interface NewSongDialogProps {
  open: boolean;
  onClose: () => void;
}

/** null = nothing searched yet; an array = a search that ran, possibly finding nothing. */
type Results = TrackCandidate[] | null;

export function NewSongDialog({ open, onClose }: NewSongDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createSong = useLibraryStore((s) => s.createSong);
  const { generate, search } = useGenerateSong();
  const startGeneration = useGenerationStore((s) => s.start);
  const failGeneration = useGenerationStore((s) => s.fail);
  const finishGeneration = useGenerationStore((s) => s.finish);

  const canSubmit = query.trim().length >= MIN_QUERY_LENGTH;

  const reset = () => {
    setQuery("");
    setResults(null);
    setError(null);
    setSearching(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleManual = () => {
    createSong({ mode: "manual" });
    handleClose();
  };

  const handleSearch = async () => {
    if (!canSubmit || searching) return;
    setSearching(true);
    setError(null);
    const outcome = await search(query);
    setSearching(false);

    if ("error" in outcome) {
      setError(outcome.error);
      return;
    }
    // No catalogue configured is not "no such song" — go straight to generating, which is what
    // the app did before the picker existed.
    if (!outcome.configured) {
      void handleGenerate();
      return;
    }
    setResults(outcome.results);
  };

  /** `picked` absent means "generate from the query alone", the pre-picker behaviour. */
  const handleGenerate = async (picked?: TrackCandidate) => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return;

    // Hand off to the full-screen overlay and close, rather than holding the dialog open with a
    // spinner in it — generation takes seconds and the main window is where the result lands.
    startGeneration(picked ? `${picked.title}${picked.artist ? ` — ${picked.artist}` : ""}` : trimmed);
    handleClose();

    const result = await generate(trimmed, picked);
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
          <Label htmlFor="ai-query">Título da música ou um trecho da letra</Label>
          <div className="flex gap-2">
            <Input
              id="ai-query"
              autoFocus
              placeholder={'ex.: "Oceans do Hillsong" ou "estou preparando um caminho"'}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // The old results describe the old query; keeping them on screen would invite
                // picking a recording that has nothing to do with what's now typed.
                setResults(null);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
            />
            <Button onClick={handleSearch} disabled={!canSubmit || searching}>
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Buscar
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-ink/45">
            A busca procura tanto no título quanto dentro da letra.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {results !== null && results.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-ink/60">Escolha a gravação:</p>
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {results.map((track) => (
                <li key={track.commontrackId}>
                  <button
                    onClick={() => void handleGenerate(track)}
                    className="flex w-full items-baseline justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{track.title}</span>
                      <span className="block truncate text-xs text-ink/55">
                        {track.artist || "artista desconhecido"}
                      </span>
                    </span>
                    {track.language && (
                      <span className="shrink-0 text-[13px] uppercase text-ink/40">{track.language}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {results !== null && results.length === 0 && (
          <p className="text-sm text-ink/55">
            Nada encontrado no catálogo. Você ainda pode gerar com IA ou colar a letra você mesmo.
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleManual} className="flex-1">
            <PenLine size={16} />
            Criar manualmente
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handleGenerate()}
            disabled={!canSubmit}
            className="flex-1"
          >
            <Sparkles size={16} />
            Gerar com IA
          </Button>
        </div>
      </div>
    </Modal>
  );
}
