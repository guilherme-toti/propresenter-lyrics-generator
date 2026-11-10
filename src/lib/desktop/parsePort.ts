import { z } from "zod";

/** A legal TCP port, as request bodies carry ProPresenter's API port. */
export const portSchema = z.number().int().min(1).max(65535);

/** Parses a port field's raw text strictly: the whole string must be digits, and the
 * result must be a legal TCP port. Returns null for anything else, so the value shown
 * in the field and the value stored can never silently disagree. */
export function parsePort(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const port = Number.parseInt(trimmed, 10);
  return portSchema.safeParse(port).success ? port : null;
}
