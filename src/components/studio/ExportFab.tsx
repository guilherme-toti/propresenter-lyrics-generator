"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { Song } from "@/lib/types";

export function ExportFab({ song }: { song: Song }) {
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
        throw new Error(data.error ?? "Falha ao exportar.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const filename = match ? decodeURIComponent(match[1]) : `${song.title || "musica"}.pro`;

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
      setError(err instanceof Error ? err.message : "Falha ao exportar.");
      setStatus("error");
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {error && (
        <p className="max-w-xs rounded-lg border border-line bg-white px-3 py-2 text-xs text-red-600 shadow-lg">
          {error}
        </p>
      )}
      <button
        onClick={handleExport}
        disabled={!canExport || status === "loading"}
        title={canExport ? undefined : "Alinhe pelo menos uma linha antes de exportar."}
        className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "loading" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        Exportar
      </button>
    </div>
  );
}
