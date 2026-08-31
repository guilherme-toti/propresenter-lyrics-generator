import { z } from "zod";

export const aiSongSchema = z.object({
  title: z.string().min(1),
  artist: z.string().default(""),
  key: z.string().nullable().optional().default(null),
  originalLanguage: z.string().min(1),
  translationLanguage: z.string().min(1),
  isOfficialTranslation: z.boolean().default(false),
  sections: z
    .array(
      z.object({
        label: z.string().min(1),
        lines: z
          .array(
            z.object({
              original: z.string(),
              translation: z.string(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export type AiSongResponse = z.infer<typeof aiSongSchema>;
