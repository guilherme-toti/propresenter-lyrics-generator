import { fetchPlaylists } from "@/lib/desktop/api";

/** True unless ProPresenter answered with a list that lacks the playlist. Not being able to ask
 * (the request failed, or ProPresenter couldn't be reached and the route said so in `error`) is no
 * proof the playlist is gone, and must not silently clear the user's selection. */
export async function playlistStillExists(port: number, playlistId: string): Promise<boolean> {
  try {
    const { playlists, error } = await fetchPlaylists(port);
    if (error) return true;
    return playlists.some((p) => p.id === playlistId);
  } catch {
    return true;
  }
}
