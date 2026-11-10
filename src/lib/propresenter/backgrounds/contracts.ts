import { z } from "zod";

/**
 * What /api/backgrounds/* answer, defined once: the server code that builds each reply takes its
 * type from here, and the Backgrounds screen parses the reply against the same schema. Nothing but
 * zod on purpose, so the client can import the schemas without pulling in the server's Node
 * modules, and `node --test` can load it.
 */

/** Same values as media.ts's MediaType. The server assigns one to the other and the screen passes
 * them back, so the two can't drift without a compile error. */
export const mediaTypeSchema = z.enum(["image", "video"]);

/** One file a macro shows, however many macros show it. Several macros share files ("Início" and
 * "Fim" show the same prop), and replacing the file changes all of them at once. */
export const mediaSlotSchema = z.object({
  /** Derived from the file's path, so it survives a reload and the client never needs the path. */
  id: z.string(),
  fileName: z.string(),
  mediaType: mediaTypeSchema,
  exists: z.boolean(),
  /** Changes whenever the file is replaced, which is what cache-busts the preview. Null when the
   * file is missing. */
  mtimeMs: z.number().nullable(),
  /** Whether a backup of an earlier version is waiting for "Desfazer". */
  canUndo: z.boolean(),
  /** Whether a file "Desfazer" took off is waiting for "Refazer". */
  canRedo: z.boolean(),
});
export type MediaSlot = z.infer<typeof mediaSlotSchema>;

/** What one macro puts on screen, as slot ids in action order: `backgrounds` are the files its
 * media actions show, `props` the files inside the props it shows. */
export const macroMediaSchema = z.object({
  macroUuid: z.string(),
  macroName: z.string(),
  /** The macro's colour in ProPresenter, as CSS, so it looks like its button there. */
  macroColor: z.string().nullable(),
  backgrounds: z.array(z.string()),
  props: z.array(z.string()),
});
export type MacroMedia = z.infer<typeof macroMediaSchema>;

/** What the Backgrounds screen loads: the files, and which macro shows which. */
export const backgroundsOverviewSchema = z.object({
  slots: z.array(mediaSlotSchema),
  macros: z.array(macroMediaSchema),
});
export type BackgroundsOverview = z.infer<typeof backgroundsOverviewSchema>;

/** Replace, undo and redo all answer with the slot as it is now. */
export const slotChangeReplySchema = z.object({ slot: mediaSlotSchema });
export type SlotChangeReply = z.infer<typeof slotChangeReplySchema>;

/** A file dropped on the Backgrounds screen's tray, waiting to be dragged onto a screen. */
export const trayFileSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mediaType: mediaTypeSchema,
  /** The path the client sent, resolved. It goes back as the source when the file is sent to a
   * screen; the screen's own file is always looked up from the macros. */
  sourcePath: z.string(),
});
export type TrayFile = z.infer<typeof trayFileSchema>;

export const trayRefusalSchema = z.object({
  fileName: z.string(),
  message: z.string(),
});
export type TrayRefusal = z.infer<typeof trayRefusalSchema>;

export const addTrayFilesReplySchema = z.object({
  files: z.array(trayFileSchema),
  refused: z.array(trayRefusalSchema),
});
export type AddTrayFilesReply = z.infer<typeof addTrayFilesReplySchema>;

/** The workspace ProPresenter lists as its own, or null when none was found. */
export const detectedFolderReplySchema = z.object({ folder: z.string().nullable() });
export type DetectedFolderReply = z.infer<typeof detectedFolderReplySchema>;
