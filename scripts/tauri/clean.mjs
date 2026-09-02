#!/usr/bin/env node
// Runs before `next build` in the tauri:prebuild chain. A stale .next/
// directory left over from a `next dev` session (or from before switching
// branches/merging) can carry typed-routes validator files that no longer
// match the current route set, which fails `next build`'s type check with
// confusing errors pointing at .next/dev/types/validator.ts rather than any
// real problem in the app. Always building from a clean slate here avoids
// that class of stale-cache failure entirely.

import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const nextDir = path.join(repoRoot, ".next");

rmSync(nextDir, { recursive: true, force: true });
console.log("[tauri:prebuild] cleared .next build cache");
