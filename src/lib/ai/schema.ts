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
    isOfficialTranslation: z.boolean().default(false),
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
