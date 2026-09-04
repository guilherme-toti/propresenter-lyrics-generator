import { z } from "zod";

const churchLanguageSchema = z.enum(["English", "Português (Brasil)"]);

const sectionSchema = z.object({
  label: z.string().min(1),
  lines: z
    .array(
      z.object({
        original: z.string(),
        translation: z.string(),
      }),
    )
    .min(1),
});

export const aiSongSchema = z
  .object({
    title: z.string().min(1),
    artist: z.string().default(""),
    originalLanguage: churchLanguageSchema,
    translationLanguage: churchLanguageSchema,
    sections: z.array(sectionSchema).min(1),
  })
  .refine((data) => data.originalLanguage !== data.translationLanguage, {
    message: "originalLanguage and translationLanguage must be different.",
    path: ["translationLanguage"],
  });

export type AiSongResponse = z.infer<typeof aiSongSchema>;

export const aiRealignSchema = z.object({
  sections: z.array(sectionSchema).min(1),
});

export type AiRealignResponse = z.infer<typeof aiRealignSchema>;

/**
 * Used when the catalogue gave no usable language tag for the picked recording: a minimal call
 * that only identifies which of the two supported languages the lyrics are in — no translation is
 * attempted by the model. See identifyLanguageOnly() in openrouter.ts.
 */
export const aiLanguageSchema = z.object({
  originalLanguage: churchLanguageSchema,
});

export type AiLanguageResponse = z.infer<typeof aiLanguageSchema>;

/**
 * The over-the-wire shape actually requested from the model for translate/realign calls: a
 * [original, translation] tuple per line instead of a {original, translation} object. Repeating
 * those two key names on every single lyric line was a meaningful share of completion tokens (and
 * therefore latency) on a full song. expandWireSections() converts this back into the
 * {original, translation} shape the rest of the app expects, right after parsing.
 */
const wireSectionSchema = z.object({
  label: z.string().min(1),
  lines: z.array(z.tuple([z.string(), z.string()])).min(1),
});

export const aiRealignWireSchema = z.object({
  sections: z.array(wireSectionSchema).min(1),
});

/**
 * translateLiterally()'s response: just the translated text, not structured sections — the
 * structure is enforced afterward by pairLineAligned() against the original (same section/line
 * counts required), which is stricter and reuses code already trusted for Musixmatch's own
 * translations rather than asking the model to also get JSON structure right.
 */
export const aiLiteralTranslationSchema = z.object({
  translatedText: z.string().min(1),
});

export type AiLiteralTranslationResponse = z.infer<typeof aiLiteralTranslationSchema>;

export function expandWireSections(
  sections: z.infer<typeof wireSectionSchema>[],
): { label: string; lines: { original: string; translation: string }[] }[] {
  return sections.map((section) => ({
    label: section.label,
    lines: section.lines.map(([original, translation]) => ({ original, translation })),
  }));
}
