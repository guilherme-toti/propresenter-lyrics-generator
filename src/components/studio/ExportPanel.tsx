"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Song } from "@/lib/types";

export function ExportPanel({ song }: { song: Song }) {
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
    <Card>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-ink/45">Exportar</p>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <Button onClick={handleExport} disabled={!canExport || status === "loading"}>
        {status === "loading" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        Exportar
      </Button>
      {!canExport && <p className="mt-2 text-xs text-ink/40">Alinhe pelo menos uma linha antes de exportar.</p>}
    </Card>
  );
}
