import type { AlignedLine } from "@/lib/types";
import { labelSections } from "@/lib/alignment";

export type LineLanguage = "pt" | "en" | "ambiguous";

const PT_DIACRITICS = /[ãõáàâéêíóôúçÃÕÁÀÂÉÊÍÓÔÚÇ]/;

const PT_STOPWORDS = new Set([
  "que", "não", "com", "uma", "um", "para", "você", "está", "são", "meu", "minha",
  "teu", "tua", "seu", "sua", "nosso", "nossa", "eu", "ele", "ela", "nós", "de", "da",
  "do", "das", "dos", "em", "na", "no", "nas", "nos", "é", "era", "será", "como", "mais",
  "muito", "tudo", "nada", "aqui", "ali", "lá", "sim", "porque", "quando", "onde",
  "vou", "vem", "vamos", "seja", "quero", "posso", "temos", "tenho", "só", "já",
]);

const EN_STOPWORDS = new Set([
  "the", "and", "of", "to", "is", "you", "your", "are", "my", "his", "her", "our", "we",
  "he", "she", "they", "in", "on", "at", "for", "with", "this", "that", "was", "will",
  "be", "have", "has", "do", "does", "not", "all", "everything", "nothing", "here",
  "there", "yes", "no", "because", "when", "where", "more", "very", "am", "us", "me",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}']+/u)
    .filter(Boolean);
}

/**
 * Classifies a single line as Portuguese, English, or ambiguous — tuned for
 * exactly these two known languages, not general language identification.
 * Diacritics are a near-conclusive signal when present (English essentially
 * never uses ã/õ/ç); their absence proves nothing, since plenty of Portuguese
 * words lack them ("que", "de", "amor"), which is why stopword scoring is the
 * fallback rather than the primary signal.
 */
export function detectLine(text: string): LineLanguage {
  const trimmed = text.trim();
  if (!trimmed) return "ambiguous";

  if (PT_DIACRITICS.test(trimmed)) return "pt";

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return "ambiguous";

  let ptScore = 0;
  let enScore = 0;
  for (const token of tokens) {
    if (PT_STOPWORDS.has(token)) ptScore += 1;
    if (EN_STOPWORDS.has(token)) enScore += 1;
  }

  if (ptScore === 0 && enScore === 0) return "ambiguous";
  if (ptScore === enScore) return "ambiguous";
  return ptScore > enScore ? "pt" : "en";
}

export interface CueClassification {
  isBilingual: boolean;
  dominantLanguage: "pt" | "en";
  lineTags: LineLanguage[][];
}

/** At least this fraction of confidently-tagged lines must be the minority
 * language before the whole song is treated as bilingual — guards against a
 * single stray misclassified line flipping an otherwise single-language song. */
const BILINGUAL_MIX_THRESHOLD = 0.15;

export function classifyCueLines(cueLines: string[][]): CueClassification {
  const lineTags = cueLines.map((lines) => lines.map(detectLine));
  const flat = lineTags.flat();
  const ptCount = flat.filter((t) => t === "pt").length;
  const enCount = flat.filter((t) => t === "en").length;
  const confidentTotal = ptCount + enCount;

  const dominantLanguage: "pt" | "en" = ptCount >= enCount ? "pt" : "en";

  if (confidentTotal === 0) {
    return { isBilingual: false, dominantLanguage, lineTags };
  }

  const minorityCount = Math.min(ptCount, enCount);
  const isBilingual = minorityCount / confidentTotal >= BILINGUAL_MIX_THRESHOLD;

  return { isBilingual, dominantLanguage, lineTags };
}

/**
 * Builds languageA (Portuguese)/languageB (English) raw text for the single-language case — one
 * block per cue, blank-line separated, matching the format buildAlignmentFromManual()
 * (src/lib/alignment.ts) already expects for manually-pasted lyrics. Only used when
 * classifyCueLines() says the song isn't bilingual — see buildBilingualAlignment() below for the
 * bilingual case, which builds AlignedLine[] directly per cue instead of round-tripping through
 * raw text (a cue with content on only one side would otherwise silently drop that side's block,
 * desyncing every later cue's index-wise pairing).
 */
export function buildRawTextFromTags(
  cueLines: string[][],
  dominantLanguage: "pt" | "en",
): { languageA: string; languageB: string } {
  const blocks = cueLines.map((lines) => lines.join("\n"));
  return dominantLanguage === "pt"
    ? { languageA: blocks.join("\n\n"), languageB: "" }
    : { languageA: "", languageB: blocks.join("\n\n") };
}

/**
 * Builds an AlignedLine[] directly per cue for the bilingual case, pairing each cue's own PT/EN
 * lines index-wise — never across cues. Unlike routing through buildRawTextFromTags() +
 * buildAlignmentFromManual(), a cue with content on only one side (a PT-only title/artist slide,
 * or every ambiguous line collapsing to dominantLanguage when the AI fallback fails) can't shift
 * any subsequent cue's pairing out of sync, because each cue keeps its own row(s) regardless of
 * whether the other side is empty for that cue.
 */
export function buildBilingualAlignment(cueLines: string[][], tags: ("pt" | "en")[][]): AlignedLine[] {
  const cues = cueLines
    .map((lines, cueIndex) => {
      const cueTags = tags[cueIndex];
      const ptLines = lines.filter((_, i) => cueTags[i] === "pt");
      const enLines = lines.filter((_, i) => cueTags[i] === "en");
      return { ptLines, enLines };
    })
    .filter((cue) => cue.ptLines.length > 0 || cue.enLines.length > 0);

  const labels = labelSections(cues.map((cue) => (cue.ptLines.length > 0 ? cue.ptLines : cue.enLines)));

  const result: AlignedLine[] = [];
  cues.forEach((cue, cueIndex) => {
    const rowCount = Math.max(cue.ptLines.length, cue.enLines.length);
    for (let j = 0; j < rowCount; j++) {
      result.push({
        id: crypto.randomUUID(),
        a: cue.ptLines[j] ?? "",
        b: cue.enLines[j] ?? "",
        sectionBreakBefore: j === 0,
        sectionLabel: j === 0 ? (labels[cueIndex] ?? `Parte ${cueIndex + 1}`) : undefined,
      });
    }
  });
  return result;
}
