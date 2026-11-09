export async function register(): Promise<void> {
  // envFile reads the disk through node:fs, which the edge bundle can't resolve.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadDesktopEnv } = await import("@/lib/desktop/envFile");
    await loadDesktopEnv();
  }
}
