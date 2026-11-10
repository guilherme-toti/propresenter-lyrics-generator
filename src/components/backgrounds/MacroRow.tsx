"use client";

import { useState, type ReactNode } from "react";
import type { MacroMedia } from "@/lib/propresenter/backgrounds/slots";
import { InlineMessage } from "@/components/ui/InlineMessage";
import { MacroTestButton } from "./MacroTestButton";
import type { ScreenRole } from "@/lib/propresenter/backgrounds/requests";
import { EmptyScreen } from "./ScreenFrame";

interface MacroRowProps {
  folder: string;
  macro: MacroMedia;
  port: number | null;
  onScreen: boolean;
  onShown: (macroUuid: string) => void;
  renderFrame: (slotId: string, role: ScreenRole) => ReactNode;
}

/** One moment of the service, in ProPresenter's order: its central screen (the macro's media) next
 * to its side panels (its prop). An item of the macros list, one per line. */
export function MacroRow({ folder, macro, port, onScreen, onShown, renderFrame }: MacroRowProps) {
  const [testError, setTestError] = useState<string | null>(null);
  // Almost always one of each. A macro with more media actions gets one row per extra file.
  const rows = Math.max(macro.backgrounds.length, macro.props.length, 1);

  const cell = (slotIds: string[], index: number, role: ScreenRole) => {
    const slotId = slotIds[index];
    if (slotId) return renderFrame(slotId, role);
    return index === 0 ? <EmptyScreen role={role} /> : <div />;
  };

  return (
    <li className="flex flex-col gap-4 p-4">
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
          folder={folder}
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

      {/* 256fr/81fr is (16/9)/(9/16): the 16:9 screen and the 9:16 panel come out exactly the same
          height. They fill the row; the macros pane's width is what sizes them. */}
      <div className="grid grid-cols-[256fr_81fr] items-start gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="contents">
            {cell(macro.backgrounds, index, "background")}
            {cell(macro.props, index, "prop")}
          </div>
        ))}
      </div>

      {testError && (
        <InlineMessage tone="error" variant="boxed" onDismiss={() => setTestError(null)}>
          {testError}
        </InlineMessage>
      )}
    </li>
  );
}
