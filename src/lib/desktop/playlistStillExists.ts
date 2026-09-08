export async function playlistStillExists(port: number, playlistId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/playlists/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port }),
    });
    if (!res.ok) return true; // request failure isn't proof the playlist is gone — don't block on it
    const data = await res.json();
    // An unreachable ProPresenter reports its own failure via `error` (see /api/playlists/list) —
    // that isn't proof the playlist is gone either, and must not silently clear the user's selection.
    if (data.error) return true;
    const playlists: { id: string }[] = Array.isArray(data.playlists) ? data.playlists : [];
    return playlists.some((p) => p.id === playlistId);
  } catch {
    return true;
  }
}
