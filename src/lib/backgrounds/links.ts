import type { BackgroundsOverview, MacroMedia } from "@/lib/propresenter/backgrounds/slots";

export type HistoryStep = "undoing" | "redoing";

/** Follower slot id → the slot it follows, as the user linked them (desktopStore). */
export type ScreenLinks = Record<string, string>;

/**
 * Which screens change together. Pure, and only type imports, so `node --test` can load it.
 * Two macros showing the same file always change together. Beyond that, only screens the user
 * linked do: identical files alone aren't a reason, since the same video is often put on several
 * moments one by one.
 */

/** The links whose two slots are both still on screen, leaving out a follower of a follower: a
 * screen that's followed can't follow another, so a change never spreads further than one step. */
export function activeLinks(links: ScreenLinks, slots: BackgroundsOverview["slots"]): ScreenLinks {
  const present = new Set(slots.map((slot) => slot.id));
  const usable = Object.entries(links).filter(
    ([follower, leader]) => follower !== leader && present.has(follower) && present.has(leader),
  );
  const followers = new Set(usable.map(([follower]) => follower));
  return Object.fromEntries(usable.filter(([, leader]) => !followers.has(leader)));
}

export function followersOf(slotId: string, links: ScreenLinks): string[] {
  return Object.entries(links)
    .filter(([, leader]) => leader === slotId)
    .map(([follower]) => follower);
}

/** The slot and the screens that follow it: what a file dropped on it ends up replacing. */
export function changeGroup(slotId: string, links: ScreenLinks): string[] {
  return [slotId, ...followersOf(slotId, links)];
}

/** The other macros a change to this macro's slot also shows up in, in ProPresenter's order:
 * those showing the same file, and those whose screens follow it. */
export function otherMacrosChanged(
  macroUuid: string,
  slotId: string,
  macros: MacroMedia[],
  links: ScreenLinks,
): string[] {
  const group = new Set(changeGroup(slotId, links));
  return macros
    .filter((macro) => macro.macroUuid !== macroUuid)
    .filter((macro) => [...macro.backgrounds, ...macro.props].some((id) => group.has(id)))
    .map((macro) => macro.macroName);
}

/** The names of the macros showing a slot, in ProPresenter's order. */
export function macroNamesShowing(slotId: string, macros: MacroMedia[]): string[] {
  return macros
    .filter((macro) => [...macro.backgrounds, ...macro.props].includes(slotId))
    .map((macro) => macro.macroName);
}

/**
 * The slots a "Desfazer" or "Refazer" on this one takes along, the clicked slot first. Undo
 * follows what the last send did: the followers that went out with this slot go back with it.
 * Redo brings back what was undone together. Only slots that have that step available come along.
 */
export function historyGroup(
  slotId: string,
  step: HistoryStep,
  slots: BackgroundsOverview["slots"],
  together: { sent: Record<string, string[]>; undone: Record<string, string[]> },
): string[] {
  const group = (step === "undoing" ? together.sent : together.undone)[slotId] ?? [slotId];
  const others = group.filter((id) => {
    const slot = id === slotId ? undefined : slots.find((candidate) => candidate.id === id);
    return slot !== undefined && (step === "undoing" ? slot.canUndo : slot.canRedo);
  });
  return [slotId, ...others];
}
