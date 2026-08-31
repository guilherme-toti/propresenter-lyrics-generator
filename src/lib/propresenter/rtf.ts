/**
 * Minimal RTF writer matching the exact flavor ProPresenter 7 embeds in
 * `Graphics.Text.rtf_data` (verified against a real decoded .pro file — see
 * vendor/propresenter7-proto/README.md). ProPresenter renders slide text from
 * this RTF blob, not from the sibling `attributes` message, so it has to be
 * byte-correct: font table, color table (duplicated as a percentage-based
 * "expandedcolortbl"), and one formatting preamble per paragraph.
 */

export interface RtfTextStyle {
  /** Font name, e.g. "Arial". Used verbatim in the RTF font table. */
  fontFamily: string;
  fontSizePt: number;
  color: { r: number; g: number; b: number };
  bold?: boolean;
  italic?: boolean;
  alignment: "left" | "center" | "right";
}

const ALIGNMENT_CODE: Record<RtfTextStyle["alignment"], string> = {
  left: "\\ql",
  center: "\\qc",
  right: "\\qr",
};

/** Escapes plain text for RTF: backslash/braces, and \uNNNN? for anything outside printable ASCII. */
function escapeRtfText(text: string): string {
  let out = "";
  for (const ch of Array.from(text)) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\") {
      out += "\\\\";
    } else if (ch === "{") {
      out += "\\{";
    } else if (ch === "}") {
      out += "\\}";
    } else if (ch === "\t") {
      out += "\\tab ";
    } else if (code >= 32 && code <= 126) {
      out += ch;
    } else if (code <= 0xffff) {
      const signed = code > 32767 ? code - 65536 : code;
      out += `\\u${signed}?`;
    } else {
      // Astral code point: escape as a UTF-16 surrogate pair, each as its own \u run.
      const high = Math.floor((code - 0x10000) / 0x400) + 0xd800;
      const low = ((code - 0x10000) % 0x400) + 0xdc00;
      const signedHigh = high > 32767 ? high - 65536 : high;
      const signedLow = low > 32767 ? low - 65536 : low;
      out += `\\u${signedHigh}?\\u${signedLow}?`;
    }
  }
  return out;
}

function toPercent(component: number): number {
  return Math.round((component / 255) * 100000);
}

/**
 * Builds the rtf_data payload for a text element containing one paragraph per line,
 * all sharing the same style (the way each of our language boxes is rendered).
 */
export function buildLyricsRtf(lines: string[], style: RtfTextStyle, boxWidthPt: number): Buffer {
  const { r, g, b } = style.color;
  const fontSizeHalfPoints = Math.round(style.fontSizePt * 2);
  const paperWidthTwips = Math.round(boxWidthPt * 20);
  const align = ALIGNMENT_CODE[style.alignment];
  const bold = style.bold ? 1 : 0;
  const italic = style.italic ? 1 : 0;

  const header =
    `{\\rtf0\\ansi\\ansicpg1252` +
    `{\\fonttbl\\f0\\fnil ${style.fontFamily};}` +
    `{\\colortbl\\red${r}\\green${g}\\blue${b};}` +
    `{\\*\\expandedcolortbl\\csgenericrgb\\c${toPercent(r)}\\c${toPercent(g)}\\c${toPercent(b)}\\c100000;}` +
    `{\\*\\listtable}{\\*\\listoverridetable}` +
    `\\uc1\\paperw${paperWidthTwips}\\margl0\\margr0\\margt0\\margb0`;

  const paragraphPreamble =
    `\\pard\\li0\\fi0\\ri0${align}\\sb0\\sa0\\sl240\\slmult1\\slleading0` +
    `\\f0\\b${bold}\\i${italic}\\ul0\\strike0\\fs${fontSizeHalfPoints}\\expnd0\\expndtw0` +
    `\\cf0\\strokewidth0\\strokec0\\nosupersub `;

  const body = (lines.length > 0 ? lines : [""])
    .map((line) => paragraphPreamble + escapeRtfText(line))
    .join("\\par");

  return Buffer.from(header + body + "}", "utf-8");
}

/** Empty rtf_data payload for a PresentationSlide.Notes field (ProPresenter always writes one). */
export function buildEmptyNotesRtf(): Buffer {
  return Buffer.from(
    "{\\rtf0\\ansi\\ansicpg1252{\\fonttbl\\f0\\fnil Arial;}{\\colortbl\\red0\\green0\\blue0;\\red255\\green255\\blue255;}" +
      "{\\*\\expandedcolortbl\\csgenericrgb\\c0\\c0\\c0\\c100000;\\csgenericrgb\\c100000\\c100000\\c100000\\c100000;}" +
      "{\\*\\listtable}{\\*\\listoverridetable}\\uc1\\paperw12240\\margl0\\margr0\\margt0\\margb0" +
      "\\pard\\li0\\fi0\\ri0\\ql\\sb0\\sa0\\sl240\\slmult1\\slleading0\\f0\\b0\\i0\\ul0\\strike0\\fs100" +
      "\\expnd0\\expndtw0\\cf0\\strokewidth0\\strokec1\\nosupersub}",
    "utf-8",
  );
}
