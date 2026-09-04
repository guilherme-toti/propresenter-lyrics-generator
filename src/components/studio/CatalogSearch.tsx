"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { useGenerateSong } from "@/lib/useGenerateSong";
import type { TrackCandidate } from "@/lib/lyrics/musixmatch";

const MIN_QUERY_LENGTH = 2;

/**
 * null = nothing searched yet; an array = a search that ran. Empty covers both "found nothing"
 * and "catalogue not configured" — either way there's nothing to pick from.
 */
type Results = TrackCandidate[] | null;

/**
 * Shared catalogue search box + results list, used both by NewSongDialog (pick a recording to
 * generate a whole song) and the per-language "buscar gravação" swap (pick a recording for one
 * side only). Owns its own query/results state so each dialog mount starts fresh; callers decide
 * what picking a track actually does.
 */
export function CatalogSearch({ onPick, autoFocus = true }: { onPick: (track: TrackCandidate) => void; autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { search } = useGenerateSong();

  const canSubmit = query.trim().length >= MIN_QUERY_LENGTH;

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
    setResults(outcome.results);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="catalog-query">Título da música ou um trecho da letra</Label>
        <div className="flex gap-2">
          <Input
            id="catalog-query"
            autoFocus={autoFocus}
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
        <p className="mt-1.5 text-xs text-ink/45">A busca procura tanto no título quanto dentro da letra.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {results !== null && results.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-ink/60">Escolha a gravação:</p>
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {results.map((track) => (
              <li key={track.commontrackId}>
                <button
                  onClick={() => onPick(track)}
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

      {results !== null && results.length === 0 && <p className="text-sm text-ink/55">Nada encontrado no catálogo.</p>}
    </div>
  );
}
