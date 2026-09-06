"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import type { ExportConflict } from "@/lib/propresenter/libraries";

const RECHECK_DELAY_MS = 500;

/**
 * Only ever mounted by ExportFab (conditionally, not via an `open` toggle on an always-mounted
 * instance — see the callsite) once /api/export/check-conflict already found a same-named file in
 * some library; a plain, conflict-free export never renders this and keeps the existing one-click
 * flow. Mounting fresh per conflict is what lets `initialName`/`initialConflict` seed local state
 * with plain useState() initializers instead of an effect that re-syncs on every prop change.
 *
 * Lets the user rename their way out of the collision (re-checking as they type, since the new
 * name could just as easily collide with a *different* file in some other library) or confirm
 * overwriting the exact file that was found — which may not be in the currently configured
 * library, hence tracking `conflict.path` rather than assuming destinationFolder.
 */
export function ExportOverwriteModal({
  open,
  libraryFolder,
  initialName,
  initialConflict,
  saving,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  libraryFolder: string;
  initialName: string;
  initialConflict: ExportConflict;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (name: string, overwritePath: string | null) => void;
}) {
  const [name, setName] = useState(initialName);
  const [conflict, setConflict] = useState<ExportConflict | null>(initialConflict);
  const [checking, setChecking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only clears a pending timer on unmount — never sets state itself, so this doesn't fall under
  // the "no setState in an effect body" rule the debounce below has to route around instead.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleNameChange = (value: string) => {
    setName(value);
    if (timerRef.current) clearTimeout(timerRef.current);

    if (value.trim() === initialName.trim()) {
      // Back to the exact name that opened this dialog — the server already answered that one, no
      // need to ask again.
      setChecking(false);
      setConflict(initialConflict);
      return;
    }

    setChecking(true);
    timerRef.current = setTimeout(() => {
      fetch("/api/export/check-conflict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libraryFolder, name: value }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setConflict(data?.conflict ?? null))
        .catch(() => setConflict(null))
        .finally(() => setChecking(false));
    }, RECHECK_DELAY_MS);
  };

  const trimmed = name.trim();

  return (
    <Modal open={open} onClose={onClose} title="Nome do arquivo">
      <div className="space-y-4">
        <div>
          <Label htmlFor="export-file-name">Nome do arquivo</Label>
          <Input id="export-file-name" autoFocus value={name} onChange={(e) => handleNameChange(e.target.value)} />
        </div>

        {checking && (
          <p className="flex items-center gap-2 text-sm text-ink/55">
            <Loader2 size={14} className="animate-spin" />
            Verificando…
          </p>
        )}

        {!checking && conflict && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Já existe uma música chamada <strong>&ldquo;{trimmed}&rdquo;</strong> na biblioteca{" "}
            <strong>{conflict.library}</strong>. Continuar vai substituir esse arquivo por esta versão.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(trimmed, conflict?.path ?? null)} disabled={saving || checking || !trimmed}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {conflict ? "Substituir arquivo" : "Salvar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
