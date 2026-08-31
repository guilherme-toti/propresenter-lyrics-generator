import { z } from "zod";

export const alignedLineSchema = z.object({
  id: z.string(),
  a: z.string(),
  b: z.string(),
  sectionBreakBefore: z.boolean(),
  sectionLabel: z.string().optional(),
});

export const exportOptionsSchema = z.object({
  layout: z.enum(["bilingual", "languageA", "languageB"]),
  linesPerSlide: z.number().int().min(1).max(8),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "backgroundColor must be a hex color"),
});

export const songSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  key: z.string(),
  mode: z.enum(["ai", "manual"]),
  languageA: z.object({ label: z.string(), raw: z.string() }),
  languageB: z.object({ label: z.string(), raw: z.string() }),
  alignment: z.array(alignedLineSchema).min(1, "Add at least one aligned line before exporting."),
  exportOptions: exportOptionsSchema,
  isOfficialTranslation: z.boolean().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
