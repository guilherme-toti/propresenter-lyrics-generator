"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Field";
import { useLibraryStore } from "@/lib/store";
import type { ProLayout, Song } from "@/lib/types";
import { cn } from "@/lib/cn";

const LAYOUT_OPTIONS: { value: ProLayout; describe: (song: Song) => string }[] = [
  { value: "bilingual", describe: () => "Both languages" },
  { value: "languageA", describe: (song) => `${song.languageA.label} only` },
  { value: "languageB", describe: (song) => `${song.languageB.label} only` },
];

export function ExportPanel({ song }: { song: Song }) {
  const updateSong = useLibraryStore((s) => s.updateSong);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const canExport = song.alignment.length > 0;

  const handleExport = async () => {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/export/propresenter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(song),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Export failed.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const filename = match ? decodeURIComponent(match[1]) : `${song.title || "song"}.pro`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
      setStatus("error");
    }
  };

  return (
    <Card>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ink/45">Export</p>
      <h3 className="mb-4 font-display text-lg font-semibold text-ink">ProPresenter 7</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Slide layout</Label>
          <div className="space-y-1.5">
            {LAYOUT_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                  song.exportOptions.layout === option.value
                    ? "border-accent bg-accent/5 text-ink"
                    : "border-line text-ink/70 hover:border-ink/30",
                )}
              >
                <input
                  type="radio"
                  name="layout"
                  className="accent-accent"
                  checked={song.exportOptions.layout === option.value}
                  onChange={() =>
                    updateSong(song.id, { exportOptions: { ...song.exportOptions, layout: option.value } })
                  }
                />
                {option.describe(song)}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="bg-color">Slide background</Label>
          <div className="flex items-center gap-2">
            <input
              id="bg-color"
              type="color"
              value={song.exportOptions.backgroundColor}
              onChange={(e) =>
                updateSong(song.id, { exportOptions: { ...song.exportOptions, backgroundColor: e.target.value } })
              }
              className="h-9 w-14 cursor-pointer rounded-md border border-line bg-white p-1"
            />
            <span className="text-sm text-ink/60">{song.exportOptions.backgroundColor}</span>
          </div>

          <p className="mt-4 text-xs text-ink/45">
            Exports a self-contained <code className="rounded bg-ink/5 px-1">.pro</code> file — one slide per group of{" "}
            {song.exportOptions.linesPerSlide} line{song.exportOptions.linesPerSlide === 1 ? "" : "s"}, grouped into
            ProPresenter slide groups by section.
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <Button className="mt-4" onClick={handleExport} disabled={!canExport || status === "loading"}>
        {status === "loading" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        Export .pro
      </Button>
      {!canExport && <p className="mt-2 text-xs text-ink/40">Align at least one line before exporting.</p>}
    </Card>
  );
}
