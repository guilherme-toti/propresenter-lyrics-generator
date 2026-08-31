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

export const songSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  mode: z.enum(["ai", "manual"]),
  languageA: z.string(),
  languageB: z.string(),
  alignment: z.array(alignedLineSchema).min(1, "Add at least one aligned line before exporting."),
  exportOptions: exportOptionsSchema,
  isOfficialTranslation: z.boolean().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
