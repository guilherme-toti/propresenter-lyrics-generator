import { z } from "zod";

export const alignedLineSchema = z.object({
  id: z.string(),
  a: z.string(),
  b: z.string(),
  sectionBreakBefore: z.boolean(),
  sectionLabel: z.string().optional(),
});

export const exportOptionsSchema = z.object({
  linesPerSlide: z.number().int().min(1).max(8),
});

export const sideSourceSchema = z.object({
  commontrackId: z.number(),
  title: z.string(),
  artist: z.string(),
});

export const sideAttributionSchema = z.object({
  copyright: z.string(),
  trackingUrl: z.string(),
});

export const songSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  mode: z.enum(["ai", "manual"]),
  languageA: z.string(),
  languageB: z.string(),
  alignment: z.array(alignedLineSchema).min(1, "Alinhe pelo menos uma linha antes de exportar."),
  exportOptions: exportOptionsSchema,
  sourceA: sideSourceSchema.optional(),
  sourceB: sideSourceSchema.optional(),
  attributionA: sideAttributionSchema.optional(),
  attributionB: sideAttributionSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * Same shape as `songSchema`, minus the "at least one aligned line" rule —
 * that rule only makes sense at export time. Used to validate songs coming
 * out of localStorage, where an unaligned in-progress draft is normal.
 */
export const storedSongSchema = songSchema.extend({
  alignment: z.array(alignedLineSchema),
});
