import { z } from "zod";
import type { TrackCandidate } from "@/lib/lyrics/musixmatch";

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
  literalTranslationA: z.enum(["done", "skipped"]).optional(),
  literalTranslationB: z.enum(["done", "skipped"]).optional(),
  translatableSide: z.enum(["languageA", "languageB"]).optional(),
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

/** A .pro file in one of the user's libraries, as listed for import or found by a library search. */
export const importableFileSchema = z.object({
  library: z.string(),
  filename: z.string(),
  /** The filename without ".pro" — what lists show, so "É Ele (2)" stays tellable from "É Ele". */
  name: z.string(),
  path: z.string(),
});
export type ImportableFile = z.infer<typeof importableFileSchema>;

/** What /api/songs/import-list and /api/songs/library-search answer. */
export const importableFilesReplySchema = z.object({ files: z.array(importableFileSchema) });
export type ImportableFilesReply = z.infer<typeof importableFilesReplySchema>;

/** What /api/songs/import answers. `storedSongSchema`, not `songSchema`: a .pro file with no text
 * imports as a song with no aligned lines, which only matters once it's exported. */
export const importedSongReplySchema = z.object({ song: storedSongSchema });
export type ImportedSongReply = z.infer<typeof importedSongReplySchema>;

/** What /api/generate-song answers: a new song, in the same shape an import gives. */
export const generatedSongReplySchema = importedSongReplySchema;

/** What /api/realign-song and /api/translate-literally answer: both editors' text, and the
 * alignment rebuilt from it. */
export const realignedLyricsReplySchema = z.object({
  languageARaw: z.string(),
  languageBRaw: z.string(),
  alignment: z.array(alignedLineSchema),
});
export type RealignedLyrics = z.infer<typeof realignedLyricsReplySchema>;

/** A recording in the lyrics catalogue. Checked against the server's own type, so a field the
 * server adds or renames fails to compile here. */
export const trackCandidateSchema = z.object({
  commontrackId: z.number(),
  title: z.string(),
  artist: z.string(),
  language: z.string(),
  trackRating: z.number(),
}) satisfies z.ZodType<TrackCandidate>;

/** What /api/songs/search answers. */
export const trackSearchReplySchema = z.object({ results: z.array(trackCandidateSchema) });

/** What /api/songs/lyrics answers: one recording's text and the attribution Musixmatch requires
 * wherever it's shown. */
export const recordingLyricsReplySchema = z.object({
  text: z.string(),
  copyright: z.string(),
  trackingUrl: z.string(),
});
export type RecordingLyrics = z.infer<typeof recordingLyricsReplySchema>;
