/** Parses a port field's raw text strictly: the whole string must be digits, and the
 * result must be a legal TCP port. Returns null for anything else, so the value shown
 * in the field and the value stored can never silently disagree. */
export function parsePort(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const port = Number.parseInt(trimmed, 10);
  return port >= 1 && port <= 65535 ? port : null;
}
