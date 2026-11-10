import { postJsonAs } from "@/lib/postJson";
import {
  realignedLyricsReplySchema,
  recordingLyricsReplySchema,
  type RealignedLyrics,
  type RecordingLyrics,
} from "@/lib/songSchema";

/** The studio editors' way to the routes that bring lyrics in from the server. */

/** "Realinhar com IA": the AI reconciles both editors' text and rebuilds the alignment from it. */
export function realignLyrics(languageARaw: string, languageBRaw: string): Promise<RealignedLyrics> {
  return postJsonAs("/api/realign-song", { languageARaw, languageBRaw }, realignedLyricsReplySchema);
}

/** "Buscar": one catalogue recording's text, to swap in for one side. */
export function fetchRecordingLyrics(commontrackId: number): Promise<RecordingLyrics> {
  return postJsonAs("/api/songs/lyrics", { commontrackId }, recordingLyricsReplySchema);
}
