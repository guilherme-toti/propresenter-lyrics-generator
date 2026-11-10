import { z } from "zod";
import { mediaTypeSchema } from "@/lib/propresenter/backgrounds/contracts";

/** Both go into Google's URLs and headers, so only Drive's own alphabet gets through. */
const driveTokenSchema = z.string().regex(/^[A-Za-z0-9_-]+$/).max(200);

/** A folder or file in Drive, as the API addresses it. */
export const driveRefSchema = z.object({
  id: driveTokenSchema,
  /** Links shared before Google's 2021 security update carry one, and Drive refuses those items
   * without it. */
  resourceKey: driveTokenSchema.nullable(),
});
export type DriveRef = z.infer<typeof driveRefSchema>;

export const driveFolderRequestSchema = z.object({ folder: driveRefSchema });
export type DriveFolderRequest = z.infer<typeof driveFolderRequestSchema>;

export const driveDownloadRequestSchema = z.object({ file: driveRefSchema });
export type DriveDownloadRequest = z.infer<typeof driveDownloadRequestSchema>;

/** One item of a Drive folder, as the Drive browser lists it. */
export const driveEntrySchema = driveRefSchema.extend({
  name: z.string(),
  kind: z.enum(["folder", "file"]),
  /** RFC 3339, UTC. */
  modifiedTime: z.string().nullable(),
  /** Bytes; null for folders and when Drive doesn't say. */
  size: z.number().nullable(),
  /** What the tray would take it as; null for a folder or a file it can't take. */
  mediaType: mediaTypeSchema.nullable(),
  /** Where the window loads the picture Drive made of the file (a frame, for a video), through this
   * app's server; null when Drive has none yet. One that doesn't load leaves the file's icon. */
  thumbnailUrl: z.string().nullable(),
});
export type DriveEntry = z.infer<typeof driveEntrySchema>;

export const driveFolderReplySchema = z.object({
  name: z.string(),
  entries: z.array(driveEntrySchema),
});
export type DriveFolderReply = z.infer<typeof driveFolderReplySchema>;

export const serviceAccountRequestSchema = z.object({ path: z.string().min(1) });
export type ServiceAccountRequest = z.infer<typeof serviceAccountRequestSchema>;

/** What /api/settings/google-service-account answers: the account's email, the address the Drive
 * folder has to be shared with; null when none is set up. */
export const serviceAccountReplySchema = z.object({ email: z.string().nullable() });

/** /api/drive/download answers one of these per line while it downloads, ending with "done" or
 * "error". */
export const driveDownloadEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), received: z.number(), total: z.number().nullable() }),
  /** Where the file now is on this computer, to hand to the tray. */
  z.object({ type: z.literal("done"), path: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type DriveDownloadEvent = z.infer<typeof driveDownloadEventSchema>;
