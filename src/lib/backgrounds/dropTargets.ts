const SLOT_DROP_ATTRIBUTE = "data-slot-id";

/** Spread onto a screen to make it the drop target for its slot. Several screens can carry the
 * same slot (two macros showing one file), and any of them takes the drop. */
export function slotDropTargetProps(slotId: string): Record<typeof SLOT_DROP_ATTRIBUTE, string> {
  return { [SLOT_DROP_ATTRIBUTE]: slotId };
}

/** The slot of the screen under a point in CSS pixels, or null between screens. */
export function slotIdAtPoint(x: number, y: number): string | null {
  const target = document.elementFromPoint(x, y)?.closest(`[${SLOT_DROP_ATTRIBUTE}]`);
  return target?.getAttribute(SLOT_DROP_ATTRIBUTE) ?? null;
}
