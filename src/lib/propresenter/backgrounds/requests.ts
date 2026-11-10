import { z } from "zod";
import { portSchema } from "@/lib/desktop/parsePort";

/** Request bodies for /api/backgrounds/*, shared by the route handlers and the client calls. */

const folderSchema = z.string().min(1);
const slotIdSchema = z.string().regex(/^[0-9a-f]{16}$/);

/** Checking a workspace folder, and listing its slots. */
export const folderRequestSchema = z.object({ folder: folderSchema });
export type FolderRequest = z.infer<typeof folderRequestSchema>;

export const previewQuerySchema = z.object({ folder: folderSchema, slot: slotIdSchema });

export const replaceSlotRequestSchema = z.object({
  folder: folderSchema,
  slotId: slotIdSchema,
  /** The file the user picked or dropped. Only ever read; the target is re-derived from the macros. */
  sourcePath: z.string().min(1),
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
  // Goes into ProPresenter's URL path, so nothing but a UUID's characters gets through.
  macroUuid: z.string().regex(/^[0-9A-Fa-f-]{36}$/),
});
export type TriggerMacroRequest = z.infer<typeof triggerMacroRequestSchema>;

export const clearScreenRequestSchema = z.object({ port: portSchema });
export type ClearScreenRequest = z.infer<typeof clearScreenRequestSchema>;
