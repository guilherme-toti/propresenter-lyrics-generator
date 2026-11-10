/**
 * The open modals, innermost last, so Escape closes only the one on top: every open modal listens
 * on the window, and without this a picker opened from Ajustes closed Ajustes too. Nothing
 * imported, so `node --test` can load it.
 */

const openModals: symbol[] = [];

/** Call when a modal opens; keep the key to check and remove it. */
export function pushModal(): symbol {
  const key = Symbol("modal");
  openModals.push(key);
  return key;
}

export function removeModal(key: symbol): void {
  const index = openModals.indexOf(key);
  if (index >= 0) openModals.splice(index, 1);
}

export function isTopModal(key: symbol): boolean {
  return openModals.at(-1) === key;
}
