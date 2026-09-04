/** Core domain model shared across the studio UI, alignment engine, and exporters. */

export type CreationMode = "ai" | "manual";

/** One synchronized row in the alignment preview: a line of language A next to its language B counterpart. */
export interface AlignedLine {
  id: string;
  a: string;
  b: string;
  /** True when this row starts a new section (a divider is rendered above it). */
  sectionBreakBefore: boolean;
  /** Label for the section starting at this row. Only meaningful when sectionBreakBefore is true. */
  sectionLabel?: string;
}

/** Church only ever works in these two languages; every song pairs one against the other. */
export type ChurchLanguage = "English" | "Português (Brasil)";

export interface ExportOptions {
  linesPerSlide: number;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  linesPerSlide: 2,
};

/** The specific catalogue recording behind one side's lyrics — lets the studio label that side
 * ("Baseado em: X — Y") and is what a per-side "buscar gravação" swap replaces. */
export interface SideSource {
  commontrackId: number;
  title: string;
  artist: string;
}

/**
 * Present per side whenever its current text came from Musixmatch, whose terms require the
 * copyright notice to be visible and a view to be counted wherever it's shown. Independent of
 * SideSource: a literal Musixmatch translation carries no recording of its own but still needs
 * attribution. See MusixmatchAttribution.
 */
export interface SideAttribution {
  copyright: string;
  trackingUrl: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  mode: CreationMode;
  /** Raw pasted/typed lyrics for Editor A, blank-line separated into sections. */
  languageA: string;
  /** Raw pasted/typed lyrics for Editor B, blank-line separated into sections. */
  languageB: string;
  alignment: AlignedLine[];
  exportOptions: ExportOptions;
  sourceA?: SideSource;
  sourceB?: SideSource;
  attributionA?: SideAttribution;
  attributionB?: SideAttribution;
  createdAt: number;
  updatedAt: number;
}

export function createEmptySong(overrides?: Partial<Song>): Song {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "Música sem título",
    artist: "",
    mode: "manual",
    languageA: "",
    languageB: "",
    alignment: [],
    exportOptions: { ...DEFAULT_EXPORT_OPTIONS },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
