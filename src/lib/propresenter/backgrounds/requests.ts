import { z } from "zod";
import { portSchema } from "@/lib/desktop/parsePort";

/** Request bodies for /api/backgrounds/*, shared by the route handlers and the client calls. */

const folderSchema = z.string().min(1);
const slotIdSchema = z.string().regex(/^[0-9a-f]{16}$/);

/** A still video is about 2 MB at 2304×1152, and a 4096×2304 one stays well under this. Base64
 * grows it by a third, and next.config's proxyClientMaxBodySize has room for the result. */
export const MAX_STILL_VIDEO_BYTES = 24 * 1024 * 1024;

/** A still video the app's window made from an image (the server can't encode video). Base64,
 * since the API takes JSON only. */
const stillVideoSchema = z.base64().max(Math.ceil(MAX_STILL_VIDEO_BYTES / 3) * 4);

/** Checking a workspace folder, and listing its slots. */
export const folderRequestSchema = z.object({ folder: folderSchema });
export type FolderRequest = z.infer<typeof folderRequestSchema>;

export const previewQuerySchema = z.object({ folder: folderSchema, slot: slotIdSchema });

export const replaceSlotRequestSchema = z.object({
  folder: folderSchema,
  slotId: slotIdSchema,
  /** The file the user picked or dropped. Only ever read; the target is re-derived from the macros. */
  sourcePath: z.string().min(1),
  /** The image at `sourcePath` as a still video, when it goes onto a video slot. */
  video: stillVideoSchema.optional(),
});
export type ReplaceSlotRequest = z.infer<typeof replaceSlotRequestSchema>;

/** Files dropped on (or picked for) the tray. Only ever read. */
export const addTrayFilesRequestSchema = z.object({ paths: z.array(z.string().min(1)).min(1).max(50) });
export type AddTrayFilesRequest = z.infer<typeof addTrayFilesRequestSchema>;

export const trayPreviewQuerySchema = z.object({ id: z.uuid() });

export const undoSlotRequestSchema = z.object({ folder: folderSchema, slotId: slotIdSchema });
export type UndoSlotRequest = z.infer<typeof undoSlotRequestSchema>;

/** Redo names the slot exactly the way undo does. */
export const redoSlotRequestSchema = undoSlotRequestSchema;
export type RedoSlotRequest = UndoSlotRequest;


export const triggerMacroRequestSchema = z.object({
  port: portSchema,
  /** Read to wait, before running, until ProPresenter has caught up with a replaced video's length. */
  folder: folderSchema,
  // Goes into ProPresenter's URL path, so nothing but a UUID's characters gets through.
  macroUuid: z.string().regex(/^[0-9A-Fa-f-]{36}$/),
});
export type TriggerMacroRequest = z.infer<typeof triggerMacroRequestSchema>;

export const clearScreenRequestSchema = z.object({ port: portSchema });
export type ClearScreenRequest = z.infer<typeof clearScreenRequestSchema>;

/** Which of a macro's screens: its media action (the main, central screen) or a prop (the side
 * panels). */
export const screenRoleSchema = z.enum(["background", "prop"]);
export type ScreenRole = z.infer<typeof screenRoleSchema>;

/** Gives one macro's screen a file of its own: a copy of the one it shares with other macros, or,
 * with `video`, its image as a still video, so the screen can be set up as a video. */
export const separateSlotRequestSchema = z.object({
  folder: folderSchema,
  slotId: slotIdSchema,
  macroUuid: z.string().min(1),
  role: screenRoleSchema,
  video: stillVideoSchema.optional(),
});
export type SeparateSlotRequest = z.infer<typeof separateSlotRequestSchema>;
