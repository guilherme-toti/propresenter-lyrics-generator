"use client";

import { useState } from "react";
import { Check, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { triggerMacro } from "@/lib/backgrounds/api";
import { errorMessage } from "@/lib/postJson";

interface MacroTestButtonProps {
  folder: string;
  macroUuid: string;
  macroName: string;
  /** Null until the ProPresenter port is set in Ajustes; nothing can run without it. */
  port: number | null;
  /** Whether this macro was the last one run from this screen. */
  onScreen: boolean;
  onShown: (macroUuid: string) => void;
  onError: (message: string) => void;
}

/** Runs the macro on ProPresenter, so a sent change can be checked on the real output. */
export function MacroTestButton({ folder, macroUuid, macroName, port, onScreen, onShown, onError }: MacroTestButtonProps) {
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!port) return;
    setRunning(true);
    try {
      await triggerMacro({ port, folder, macroUuid });
      onShown(macroUuid);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  const Icon = running ? Loader2 : onScreen ? Check : Play;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={run}
      disabled={!port || running}
      title={port ? `Rodar “${macroName}” no ProPresenter` : "Informe a porta do ProPresenter em Ajustes"}
      className="shrink-0"
    >
      <Icon size={14} aria-hidden className={running ? "animate-spin" : undefined} />
      {onScreen && !running ? "Na tela" : "Testar"}
    </Button>
  );
}
