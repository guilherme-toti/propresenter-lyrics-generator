import { z } from "zod";
import type { ExportConflict } from "./libraries";

/**
 * What /api/playlists/*, /api/propresenter/ping and /api/export/* answer, so the screens parse
 * each reply instead of trusting it. Nothing but zod at runtime, so the client can import these
 * without pulling in the server's Node modules, and `node --test` can load it. Where the server
 * has a type for a reply, the schema is checked against it, so a field the server adds or renames
 * fails to compile here.
 */

/** A playlist a song can be exported into. Also what the app keeps as the chosen playlist. */
export const playlistRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type PlaylistRef = z.infer<typeof playlistRefSchema>;

/** Not reaching ProPresenter isn't a request error: the route answers 200 with an empty list and
 * the message to show, so "no playlists" and "couldn't ask" stay tellable apart. */
export const playlistsReplySchema = z.object({
  playlists: z.array(playlistRefSchema),
  error: z.string().optional(),
});
export type PlaylistsReply = z.infer<typeof playlistsReplySchema>;

/** A failed add is not a request error either: the export already succeeded, so the route
 * answers 200 with the reason to show next to it. */
export const addToPlaylistReplySchema = z.discriminatedUnion("added", [
  z.object({ added: z.literal(true) }),
  z.object({ added: z.literal(false), reason: z.string() }),
]);
export type AddToPlaylistReply = z.infer<typeof addToPlaylistReplySchema>;

/** "Testar conexão" reports a failed connection as a result, answered 200 with ok:false. */
export const pingReplySchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), name: z.string(), hostDescription: z.string() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type PingReply = z.infer<typeof pingReplySchema>;

export const exportConflictSchema = z.object({
  library: z.string(),
  path: z.string(),
}) satisfies z.ZodType<ExportConflict>;

/** What /api/export/check-conflict answers: the same-named file it found, or null. */
export const exportConflictReplySchema = z.object({ conflict: exportConflictSchema.nullable() });

/** What /api/export/propresenter answers when it writes into a library folder: the path actually
 * written, which can differ from the name asked for (" (2)" on a collision). Without a folder it
 * answers the .pro file itself, which isn't JSON. */
export const exportSavedReplySchema = z.object({ savedTo: z.string() });
