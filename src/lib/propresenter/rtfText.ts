/**
 * Destination groups that never contain real document text — skipped
 * regardless of field order, since real ProPresenter exports were confirmed
 * (via two real decoded .pro files) to vary in which of these appear and in
 * what order before the actual paragraph content.
 */
const IGNORED_DESTINATIONS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "listtable",
  "listoverridetable",
  "info",
  "generator",
  "expandedcolortbl",
  "latentstyles",
  "rsidtbl",
  "themedata",
  "colorschememapping",
  "panose",
  "objdata",
  "pict",
]);

/**
 * Minimal RTF-to-plain-text extractor for the paragraph text embedded in a
 * ProPresenter `Graphics.Text.rtf_data` payload (see decode.ts). Not a
 * general-purpose RTF renderer — extracts plain text and paragraph breaks
 * only, silently dropping all formatting. Mirrors (in reverse) the exact
 * escape conventions `rtf.ts`'s `buildLyricsRtf`/`escapeRtfText` produce,
 * which that file's own doc comment says were verified against a real
 * decoded .pro file — this extractor was verified the same way, against two.
 */
export function rtfToPlainText(rtf: string): string {
  let i = 0;
  const n = rtf.length;
  const paragraphs: string[] = [];
  let current = "";

  // One entry per open brace: true if this group's content should be dropped
  // (either it's itself an ignored destination, or an ancestor group is).
  const skipStack: boolean[] = [];
  const isSkipping = () => skipStack.length > 0 && skipStack[skipStack.length - 1];

  function flushParagraph() {
    paragraphs.push(current);
    current = "";
  }

  while (i < n) {
    const ch = rtf[i];

    if (ch === "{") {
      let j = i + 1;
      let ignorable = isSkipping(); // inherit: a group inside a skipped group is also skipped
      if (!ignorable) {
        let k = j;
        if (rtf[k] === "\\" && rtf[k + 1] === "*") {
          ignorable = true;
          k += 2;
        }
        if (!ignorable && rtf[k] === "\\") {
          const match = /^\\([a-zA-Z]+)/.exec(rtf.slice(k));
          if (match && IGNORED_DESTINATIONS.has(match[1])) ignorable = true;
        }
      }
      skipStack.push(ignorable);
      i += 1;
      continue;
    }

    if (ch === "}") {
      skipStack.pop();
      i += 1;
      continue;
    }

    if (ch === "\\") {
      // Escaped literal brace or backslash.
      const next = rtf[i + 1];
      if (next === "{" || next === "}" || next === "\\") {
        if (!isSkipping()) current += next;
        i += 2;
        continue;
      }

      // \'XX hex-escaped byte (Windows-1252/Latin-1 range).
      const hexMatch = /^\\'([0-9a-fA-F]{2})/.exec(rtf.slice(i));
      if (hexMatch) {
        i += hexMatch[0].length;
        if (!isSkipping()) current += String.fromCharCode(parseInt(hexMatch[1], 16));
        continue;
      }

      // Control word, optionally with a signed numeric argument and one
      // optional trailing space consumed as a delimiter (standard RTF).
      const wordMatch = /^\\([a-zA-Z]+)(-?\d+)?( )?/.exec(rtf.slice(i));
      if (wordMatch) {
        const [full, word, numArg] = wordMatch;
        i += full.length;
        if (isSkipping()) continue;

        if (word === "par" || word === "line") {
          flushParagraph();
        } else if (word === "tab") {
          current += "\t";
        } else if (word === "u" && numArg !== undefined) {
          let code = parseInt(numArg, 10);
          if (code < 0) code += 65536;
          current += String.fromCharCode(code);
          // RTF always follows \uN with exactly one fallback character for
          // readers that can't do Unicode (this repo's own writer, and every
          // real file decoded during the spike, use "?") — skip it so it
          // doesn't leak into the extracted text.
          if (rtf[i] === "?") i += 1;
        }
        // Every other control word is pure formatting — silently dropped.
        continue;
      }

      // Unrecognized escape — skip just the backslash so the loop still progresses.
      i += 1;
      continue;
    }

    if (!isSkipping()) current += ch;
    i += 1;
  }
  flushParagraph();

  return paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n");
}
