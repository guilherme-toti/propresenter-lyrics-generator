"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, MonitorOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { clearScreen } from "@/lib/backgrounds/api";
import { errorMessage } from "@/lib/postJson";

const CLEARED_FEEDBACK_MS = 3_000;

/** Takes backgrounds and props off ProPresenter's output. On Windows a file that's on screen
 * can't be replaced, so this is the way out the "está na tela" message points to. */
interface ClearScreenButtonProps {
  port: number | null;
  onCleared: () => void;
  onError: (message: string) => void;
}

export function ClearScreenButton({ port, onCleared, onError }: ClearScreenButtonProps) {
  const [state, setState] = useState<"idle" | "running" | "cleared">("idle");

  useEffect(() => {
    if (state !== "cleared") return;
    const timer = setTimeout(() => setState("idle"), CLEARED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const run = async () => {
    if (!port) return;
    setState("running");
    try {
      await clearScreen({ port });
      setState("cleared");
      onCleared();
    } catch (err) {
      setState("idle");
      onError(errorMessage(err));
    }
  };

  return (
    <Button variant="ghost" onClick={run} disabled={!port || state === "running"}>
      {state === "running" ? (
        <Loader2 size={16} className="animate-spin" aria-hidden />
      ) : state === "cleared" ? (
        <Check size={16} aria-hidden />
      ) : (
        <MonitorOff size={16} aria-hidden />
      )}
      {state === "cleared" ? "Tela limpa" : "Limpar tela"}
    </Button>
  );
}
