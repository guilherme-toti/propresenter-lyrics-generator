import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Lets plain Node run the app's own TypeScript modules: they import through the `@/` alias and
 * without file extensions (Next's bundler resolves both), which Node's ESM loader doesn't.
 */
const SRC_DIR = path.resolve(fileURLToPath(new URL("../../src", import.meta.url)));

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  const isAlias = specifier.startsWith("@/");
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  if ((!isAlias && !isRelative) || !context.parentURL?.startsWith("file:")) {
    return nextResolve(specifier, context);
  }

  const base = isAlias
    ? path.join(SRC_DIR, specifier.slice(2))
    : path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  const found = [base, `${base}.ts`, path.join(base, "index.ts")].find(isFile);
  return nextResolve(found ? pathToFileURL(found).href : specifier, context);
}
