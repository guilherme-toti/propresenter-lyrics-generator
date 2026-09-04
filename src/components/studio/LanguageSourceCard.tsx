"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CatalogSearch } from "@/components/studio/CatalogSearch";
import { useLibraryStore } from "@/lib/store";
import type { Song } from "@/lib/types";
import type { TrackCandidate } from "@/lib/lyrics/musixmatch";

type Side = "languageA" | "languageB";

/** What to show under the language label: the specific recording behind this side, "Tradução
 * literal" when our AI generated it, "Tradução encontrada" for Musixmatch's own translation (a
 * real existing text we retrieved, not something translated word-for-word on demand — "literal"
 * is reserved for the AI case specifically), or nothing. */
function sourceDescription(song: Song, side: Side): string | null {
  const source = side === "languageA" ? song.sourceA : song.sourceB;
  if (source) return `${source.title}${source.artist ? ` — ${source.artist}` : ""}`;

  const raw = side === "languageA" ? song.languageA : song.languageB;
  if (!raw.trim()) return null;

  const aiTranslated = side === "languageA" ? song.literalTranslationA : song.literalTranslationB;
  if (aiTranslated === "done") return "Tradução literal";

  const attribution = side === "languageA" ? song.attributionA : song.attributionB;
  return attribution ? "Tradução encontrada" : null;
}

export function LanguageSourceCard({
  song,
  side,
  label,
  translating = false,
}: {
  song: Song;
  side: Side;
  label: string;
  /** Set by useAutoLiteralTranslation (via StudioShell) while it's filling this side
   * automatically — disables "Buscar" so a manually-picked recording can't be raced and
   * overwritten by the AI result landing after it. The loading/cancel UI itself lives next to the
   * textbox instead (see LyricsEditors' EditorPanel), not here. */
  translating?: boolean;
}) {
  const replaceSide = useLibraryStore((s) => s.replaceSide);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePick = async (track: TrackCandidate) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/songs/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commontrackId: track.commontrackId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Algo deu errado.");
      replaceSide(
        side,
        data.text,
        { commontrackId: track.commontrackId, title: track.title, artist: track.artist },
        { copyright: data.copyright, trackingUrl: data.trackingUrl },
      );
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo deu errado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="flex items-center justify-between gap-3 !p-4">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-widest text-ink/45">{label}</p>
          <p className="truncate text-sm text-ink/70">
            {translating ? "Traduzindo…" : (sourceDescription(song, side) ?? "-")}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={translating}
          onClick={() => {
            setError(null);
            setDialogOpen(true);
          }}
        >
          <Search size={13} />
          Buscar
        </Button>
      </Card>

      <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} title={`Trocar gravação — ${label}`}>
        <div className="space-y-3">
          <p className="text-sm text-ink/60">
            Escolha uma gravação do catálogo pra substituir o texto deste lado. O alinhamento não muda sozinho —
            depois de trocar, realinhe manualmente.
          </p>
          {loading && <p className="text-sm text-ink/50">Buscando letra…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <CatalogSearch onPick={(track) => void handlePick(track)} autoFocus={false} />
        </div>
      </Modal>
    </>
  );
}
