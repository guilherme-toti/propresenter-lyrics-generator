import type { MacroMedia } from "@/lib/propresenter/backgrounds/slots";

/** Only type imports, so `node --test` can load it. */

/** The other macros showing the same file as this macro's screen, in ProPresenter's order.
 * Replacing the file changes all of them, until "Separar" gives this one a file of its own. */
export function otherMacrosShowing(macroUuid: string, slotId: string, macros: MacroMedia[]): string[] {
  return macros
    .filter((macro) => macro.macroUuid !== macroUuid)
    .filter((macro) => [...macro.backgrounds, ...macro.props].includes(slotId))
    .map((macro) => macro.macroName);
}
