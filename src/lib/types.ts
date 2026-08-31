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

export interface LanguageBlock {
  /** Free-text label, e.g. "English" or "Português". */
  label: string;
  /** Raw pasted/typed lyrics, blank-line separated into sections. */
  raw: string;
}

export type ProLayout = "bilingual" | "languageA" | "languageB";

export interface ExportOptions {
  layout: ProLayout;
  linesPerSlide: number;
  backgroundColor: string; // hex
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  layout: "bilingual",
  linesPerSlide: 2,
  backgroundColor: "#000000",
};

export interface Song {
  id: string;
  title: string;
  artist: string;
  key: string;
  mode: CreationMode;
  languageA: LanguageBlock;
  languageB: LanguageBlock;
  alignment: AlignedLine[];
  exportOptions: ExportOptions;
  /** Set by AI mode when the translation is a known/official version vs. machine-translated. */
  isOfficialTranslation?: boolean;
  createdAt: number;
  updatedAt: number;
}

export function createEmptySong(overrides?: Partial<Song>): Song {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "Untitled song",
    artist: "",
    key: "",
    mode: "manual",
    languageA: { label: "Language A", raw: "" },
    languageB: { label: "Language B", raw: "" },
    alignment: [],
    exportOptions: { ...DEFAULT_EXPORT_OPTIONS },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
