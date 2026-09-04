import { create } from "zustand";

interface GenerationState {
  /** The in-flight (or errored) query, or null when no generation is active. */
  query: string | null;
  error: string | null;
  start: (query: string) => void;
  fail: (error: string) => void;
  finish: () => void;
}

/** Ephemeral (not persisted) state driving the full-screen "Gerando…" overlay. */
export const useGenerationStore = create<GenerationState>((set) => ({
  query: null,
  error: null,
  start: (query) => set({ query, error: null }),
  fail: (error) => set({ error }),
  finish: () => set({ query: null, error: null }),
}));
