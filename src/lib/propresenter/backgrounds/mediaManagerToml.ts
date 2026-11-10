/** Reads ProPresenter's media-manager.toml. No imports, so `node --test` loads it directly. */

const TOML_ESCAPES: Record<string, string> = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };

/** A TOML basic string's body. Windows paths arrive escaped (`C:\\Users\\…`), so this matters. */
function unescapeBasicString(body: string): string {
  return body.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (match, escape: string) => {
    if (escape.length > 1) return String.fromCodePoint(Number.parseInt(escape.slice(1), 16));
    return TOML_ESCAPES[escape] ?? match;
  });
}

/**
 * The `path` of every `[[workspaces]]` table in media-manager.toml. Covers just the shapes that
 * file uses (a quoted `path` key under each table), not TOML in general: pulling in a full parser
 * for one key isn't worth a dependency.
 */
export function parseWorkspacePaths(toml: string): string[] {
  const paths: string[] = [];
  let inWorkspace = false;
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      inWorkspace = /^\[\[\s*workspaces\s*\]\]$/.test(line);
      continue;
    }
    if (!inWorkspace) continue;
    const basic = /^path\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(line);
    if (basic) {
      paths.push(unescapeBasicString(basic[1]));
      continue;
    }
    const literal = /^path\s*=\s*'([^']*)'/.exec(line);
    if (literal) paths.push(literal[1]);
  }
  return paths;
}
