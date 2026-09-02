export async function playlistStillExists(folder: string, playlistId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/playlists/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    });
    if (!res.ok) return true; // scan failure isn't proof the playlist is gone — don't block on it
    const data = await res.json();
    const playlists: { id: string }[] = Array.isArray(data.playlists) ? data.playlists : [];
    return playlists.some((p) => p.id === playlistId);
  } catch {
    return true;
  }
}
