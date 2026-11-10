"use client";

import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import type { MacroMedia } from "@/lib/propresenter/backgrounds/slots";
import { DismissibleAlert } from "./DismissibleAlert";
import { MacroTestButton } from "./MacroTestButton";
import { EmptyScreen, type ScreenRole } from "./ScreenFrame";

interface MacroCardProps {
  macro: MacroMedia;
  port: number | null;
  onScreen: boolean;
  onShown: (macroUuid: string) => void;
  renderFrame: (slotId: string, role: ScreenRole) => ReactNode;
}

/** One moment of the service: its main screen (the background) next to its side panels (the prop). */
export function MacroCard({ macro, port, onScreen, onShown, renderFrame }: MacroCardProps) {
  const [testError, setTestError] = useState<string | null>(null);
  // Almost always one of each. A macro with more media actions gets one row per extra file.
  const rows = Math.max(macro.backgrounds.length, macro.props.length, 1);

  const cell = (slotIds: string[], index: number, role: ScreenRole) => {
    const slotId = slotIds[index];
    if (slotId) return renderFrame(slotId, role);
    return index === 0 ? <EmptyScreen role={role} /> : <div />;
  };

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 font-display text-lg font-semibold text-ink">
          {macro.macroColor && (
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full ring-1 ring-ink/15"
              style={{ backgroundColor: macro.macroColor }}
            />
          )}
          <span className="truncate">{macro.macroName}</span>
        </h2>
        <MacroTestButton
          macroUuid={macro.macroUuid}
          macroName={macro.macroName}
          port={port}
          onScreen={onScreen}
          onShown={(uuid) => {
            setTestError(null);
            onShown(uuid);
          }}
          onError={setTestError}
        />
      </div>

      {/* 16fr/9fr makes the square and the 9:16 panel exactly the same height. */}
      <div className="grid grid-cols-[16fr_9fr] items-start gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="contents">
            {cell(macro.backgrounds, index, "background")}
            {cell(macro.props, index, "prop")}
          </div>
        ))}
      </div>

      {testError && <DismissibleAlert onDismiss={() => setTestError(null)}>{testError}</DismissibleAlert>}
    </Card>
  );
}
