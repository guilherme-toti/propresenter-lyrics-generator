"use client";

import { Fragment, useMemo } from "react";
import { ArrowDown, ArrowUp, Plus, Scissors, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { groupIntoSlides } from "@/lib/alignment";
import { useLibraryStore } from "@/lib/store";
import type { AlignedLine, Song } from "@/lib/types";

function SectionDivider({ song, row }: { song: Song; row: AlignedLine }) {
  const editSectionLabel = useLibraryStore((s) => s.editSectionLabel);
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg bg-ink px-3 py-1.5">
      <Input
        value={row.sectionLabel ?? ""}
        onChange={(e) => editSectionLabel(song.id, row.id, e.target.value)}
        placeholder="Seção"
        className="!w-auto border-0 bg-transparent !py-0.5 text-[11px] font-semibold uppercase tracking-widest text-white placeholder:text-white/50 focus:ring-0"
      />
    </div>
  );
}

function AlignmentRow({ song, row, isSlideBreak }: { song: Song; row: AlignedLine; isSlideBreak: boolean }) {
  const editRow = useLibraryStore((s) => s.editRow);
  const addRowAfter = useLibraryStore((s) => s.addRowAfter);
  const removeRow = useLibraryStore((s) => s.removeRow);
  const moveRowInSong = useLibraryStore((s) => s.moveRowInSong);
  const toggleRowSectionBreak = useLibraryStore((s) => s.toggleRowSectionBreak);

  return (
    <div
      className={cnRow(isSlideBreak)}
    >
      <input
        value={row.a}
        onChange={(e) => editRow(song.id, row.id, "a", e.target.value)}
        placeholder="—"
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-ink outline-none"
      />
      <input
        value={row.b}
        onChange={(e) => editRow(song.id, row.id, "b", e.target.value)}
        placeholder="—"
        className="min-w-0 flex-1 border-l border-line bg-transparent px-3 py-2 text-sm text-ink outline-none"
      />
      <div className="flex shrink-0 items-center gap-0.5 border-l border-line px-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          title="Iniciar uma nova seção aqui"
          onClick={() => toggleRowSectionBreak(song.id, row.id)}
          className={cnIconBtn(row.sectionBreakBefore)}
        >
          <Scissors size={12} />
        </button>
        <button title="Mover para cima" onClick={() => moveRowInSong(song.id, row.id, "up")} className={cnIconBtn(false)}>
          <ArrowUp size={12} />
        </button>
        <button title="Mover para baixo" onClick={() => moveRowInSong(song.id, row.id, "down")} className={cnIconBtn(false)}>
          <ArrowDown size={12} />
        </button>
        <button title="Inserir linha abaixo" onClick={() => addRowAfter(song.id, row.id)} className={cnIconBtn(false)}>
          <Plus size={12} />
        </button>
        <button
          title="Excluir linha"
          onClick={() => removeRow(song.id, row.id)}
          className={cnIconBtn(false) + " hover:!bg-red-50 hover:!text-red-600"}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function cnRow(isSlideBreak: boolean) {
  return [
    "group flex items-stretch rounded-lg border bg-white",
    isSlideBreak ? "border-t-2 border-t-plum/30 border-line" : "border-line",
  ].join(" ");
}

function cnIconBtn(active: boolean) {
  return [
    "rounded p-1 transition-colors",
    active ? "bg-accent/10 text-accent" : "text-ink/40 hover:bg-ink/5 hover:text-ink",
  ].join(" ");
}

export function AlignmentPreview({ song }: { song: Song }) {
  const updateSong = useLibraryStore((s) => s.updateSong);
  const linesPerSlide = song.exportOptions.linesPerSlide;

  const slideChunks = useMemo(
    () => groupIntoSlides(song.alignment, linesPerSlide),
    [song.alignment, linesPerSlide],
  );

  if (song.alignment.length === 0) {
    return (
      <Card>
        <p className="text-sm text-ink/50">
          Nada alinhado ainda. Cole a letra nos dois editores acima e clique em “Alinhar letra”.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink/45">Pré-visualização do alinhamento</p>
          <h3 className="font-display text-lg font-semibold text-ink">Alinhe a letra</h3>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink/60">
          Novo slide a cada
          <input
            type="number"
            min={1}
            max={8}
            value={linesPerSlide}
            onChange={(e) =>
              updateSong(song.id, {
                exportOptions: { ...song.exportOptions, linesPerSlide: Math.max(1, Number(e.target.value) || 1) },
              })
            }
            className="w-14 rounded-md border border-line bg-white px-2 py-1 text-center text-xs"
          />
          linhas
        </label>
      </div>

      <div className="flex gap-0 border-b border-line pb-2 text-[11px] font-semibold uppercase tracking-widest text-ink/40">
        <span className="flex-1 px-3">Editor A</span>
        <span className="flex-1 px-3">Editor B</span>
        <span className="w-[168px] shrink-0" />
      </div>

      <div className="mt-2 space-y-1.5">
        {slideChunks.map((chunk) =>
          chunk.map((row, rowIndexInChunk) => (
            <Fragment key={row.id}>
              {row.sectionBreakBefore && <SectionDivider song={song} row={row} />}
              <AlignmentRow song={song} row={row} isSlideBreak={rowIndexInChunk === 0 && !row.sectionBreakBefore} />
            </Fragment>
          )),
        )}
      </div>
    </Card>
  );
}
