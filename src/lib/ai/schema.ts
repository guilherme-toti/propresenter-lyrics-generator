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

/**
 * Step 1 of the generation pipeline: identify the song, and separately decide whether a real,
 * officially recorded version exists in the *other* language — which is a very different question
 * from "can you translate this", and the reason it gets its own call. See generateSongWithAi().
 */
export const aiIdentifySchema = z.object({
  /**
   * Whether the model actually recognises a specific real song here. Defaults to true so a model
   * that just omits the field doesn't break the happy path — assertLooksLikeLyrics() is the real
   * backstop for a model that claims to know a song and then can't produce it.
   */
  found: z.boolean().default(true),
  title: z.string().min(1),
  artist: z.string().default(""),
  originalLanguage: churchLanguageSchema,
  officialVersion: z.object({
    exists: z.boolean(),
    title: z.string().default(""),
    artist: z.string().default(""),
  }),
});

export type AiIdentifyResponse = z.infer<typeof aiIdentifySchema>;

/** Step 2: one recorded version's lyrics, in one language, with no translation attached. */
export const aiLyricsSchema = z.object({
  sections: z
    .array(
      z.object({
        label: z.string().min(1),
        lines: z.array(z.string()).min(1),
      }),
    )
    .min(1),
});

export type AiLyricsResponse = z.infer<typeof aiLyricsSchema>;
