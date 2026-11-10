"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, Globe, LibraryBig, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { PickRow } from "@/components/ui/PickRow";
import { useGenerateSong } from "@/lib/useGenerateSong";
import { useImportSong, type ImportableFile } from "@/lib/useImportSong";
import type { TrackCandidate } from "@/lib/lyrics/musixmatch";

const MIN_QUERY_LENGTH = 2;
/** Library rows shown before "Mostrar mais" — few enough that the internet results start in view
 * too, instead of below the fold where nobody would know they exist. */
const LIBRARY_PREVIEW_COUNT = 3;

/**
 * One source's side of a search. "done" with no items is a real "found nothing"; a source that
 * couldn't be searched at all (the catalogue's key missing or refused) is "error", with the reason.
 */
type SourceState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; items: T[] }
  | { status: "error"; message: string };

const IDLE = { status: "idle" } as const;

/** Lets NewSongDialog offer songs already in the user's ProPresenter libraries next to the
 * catalogue's; the caller decides what opening one does and reports its progress back. */
export interface LibrarySearch {
  folder: string;
  onPick: (file: ImportableFile) => void;
  /** The file being opened, if any — its row spins and every row is locked meanwhile. */
  openingPath: string | null;
  openError: string | null;
}

function SectionStatus({ icon, text }: { icon: ReactNode; text: string }) {
  return <p className="flex items-center gap-2 text-sm text-ink/55">{icon}{text}</p>;
}

function ResultSection<T>({
  heading,
  state,
  emptyText,
  renderItem,
  previewCount,
  onShowAll,
}: {
  heading: ReactNode | null;
  state: SourceState<T>;
  emptyText: string;
  renderItem: (item: T) => ReactNode;
  /** Rows shown until `onShowAll` is pressed; omit to show every row. */
  previewCount?: number;
  onShowAll?: () => void;
}) {
  if (state.status === "idle") return null;
  const items = state.status === "done" ? state.items : [];
  const visible = previewCount === undefined ? items : items.slice(0, previewCount);
  const hiddenCount = items.length - visible.length;
  return (
    <section>
      {heading && <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink/60">{heading}</h3>}
      {state.status === "loading" && (
        <SectionStatus icon={<Loader2 size={14} className="animate-spin" />} text="Procurando…" />
      )}
      {state.status === "error" && <InlineMessage tone="error">{state.message}</InlineMessage>}
      {state.status === "done" && items.length === 0 && <SectionStatus icon={null} text={emptyText} />}
      {visible.length > 0 && <ul className="flex flex-col gap-1">{visible.map(renderItem)}</ul>}
      {hiddenCount > 0 && onShowAll && (
        <Button variant="ghost" size="sm" onClick={onShowAll} className="mt-1">
          <ChevronDown size={14} />
          Mostrar mais {hiddenCount}
        </Button>
      )}
    </section>
  );
}

/**
 * Shared catalogue search box + results list, used both by NewSongDialog (pick a recording to
 * generate a whole song) and the per-language "buscar gravação" swap (pick a recording for one
 * side only). Owns its own query/results state so each dialog mount starts fresh; callers decide
 * what picking a track actually does. With `library`, the same query also runs against the user's
 * ProPresenter libraries, listed first, since reopening a song already made beats generating it again.
 */
export function CatalogSearch({
  onPick,
  autoFocus = true,
  library,
}: {
  onPick: (track: TrackCandidate) => void;
  autoFocus?: boolean;
  library?: LibrarySearch;
}) {
  const [query, setQuery] = useState("");
  const [internet, setInternet] = useState<SourceState<TrackCandidate>>(IDLE);
  const [local, setLocal] = useState<SourceState<ImportableFile>>(IDLE);
  const [showAllLocal, setShowAllLocal] = useState(false);
  // Each search (and each keystroke) takes a new number, so an answer that arrives after the
  // query changed is dropped instead of listing recordings for words no longer typed.
  const searchId = useRef(0);
  const { search: searchCatalogue } = useGenerateSong();
  const { search: searchLibrary } = useImportSong();

  const searching = internet.status === "loading" || local.status === "loading";
  const canSubmit = query.trim().length >= MIN_QUERY_LENGTH;
  const opening = library?.openingPath != null;

  const handleSearch = () => {
    if (!canSubmit || searching) return;
    const id = ++searchId.current;
    const isCurrent = () => id === searchId.current;

    setInternet({ status: "loading" });
    void searchCatalogue(query).then((outcome) => {
      if (!isCurrent()) return;
      setInternet(
        "error" in outcome ? { status: "error", message: outcome.error } : { status: "done", items: outcome.results },
      );
    });

    if (!library) return;
    setLocal({ status: "loading" });
    setShowAllLocal(false);
    void searchLibrary(library.folder, query).then((outcome) => {
      if (!isCurrent()) return;
      setLocal(
        "error" in outcome ? { status: "error", message: outcome.error } : { status: "done", items: outcome.files },
      );
    });
  };

  const renderTrack = (track: TrackCandidate) => (
    <li key={track.commontrackId}>
      <PickRow
        title={track.title}
        subtitle={track.artist || "artista desconhecido"}
        trailing={track.language}
        disabled={opening}
        onClick={() => onPick(track)}
      />
    </li>
  );

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
              searchId.current += 1;
              setInternet(IDLE);
              setLocal(IDLE);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={!canSubmit || searching}>
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Buscar
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-ink/45">A busca procura tanto no título quanto dentro da letra.</p>
      </div>

      {library ? (
        <div className="max-h-[22rem] space-y-4 overflow-y-auto">
          <ResultSection
            heading={
              <>
                <LibraryBig size={14} />
                Da sua biblioteca local
              </>
            }
            state={local}
            emptyText="Nada encontrado na sua biblioteca."
            previewCount={showAllLocal ? undefined : LIBRARY_PREVIEW_COUNT}
            onShowAll={() => setShowAllLocal(true)}
            renderItem={(file) => (
              <li key={file.path}>
                <PickRow
                  title={file.name}
                  subtitle={file.library}
                  busy={library.openingPath === file.path}
                  disabled={opening}
                  onClick={() => library.onPick(file)}
                />
              </li>
            )}
          />
          {library.openError && <InlineMessage tone="error">{library.openError}</InlineMessage>}
          <ResultSection
            heading={
              <>
                <Globe size={14} />
                Da internet
              </>
            }
            state={internet}
            emptyText="Nada encontrado na internet."
            renderItem={renderTrack}
          />
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <ResultSection
            // A lone list needs no source label — only a prompt, and only once there's something to pick.
            heading={internet.status === "done" && internet.items.length > 0 ? "Escolha a gravação:" : null}
            state={internet}
            emptyText="Nada encontrado no catálogo."
            renderItem={renderTrack}
          />
        </div>
      )}
    </div>
  );
}
