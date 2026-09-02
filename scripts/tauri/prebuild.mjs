#!/usr/bin/env node
// Runs as Tauri's `beforeBuildCommand` (see src-tauri/tauri.conf.json).
// Assembles the Next.js standalone server + copies the current Node binary
// into place as the sidecar Tauri bundles into the installer. Both outputs
// are build artifacts (gitignored) — this script must run before every
// `tauri build`.
//
// Tauri's build.rs validates that every `bundle.externalBin` path exists on
// disk unconditionally — even for `tauri dev`, which never actually spawns
// the sidecar (see src-tauri/src/lib.rs). So `tauri dev` also needs the
// sidecar binary to exist, just not the assembled standalone server; run
// with --sidecar-only (see beforeDevCommand in tauri.conf.json) to do only
// that part, fast and without requiring a prior `next build`.

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  cpSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const tauriDir = path.join(repoRoot, "src-tauri");
const serverResourceDir = path.join(tauriDir, "resources", "server");
const binariesDir = path.join(tauriDir, "binaries");

function assembleServer() {
  const standaloneDir = path.join(repoRoot, ".next", "standalone");
  if (!existsSync(standaloneDir)) {
    throw new Error(
      `Missing ${standaloneDir}. Run "next build" first (next.config.ts must set output: "standalone").`,
    );
  }

  rmSync(serverResourceDir, { recursive: true, force: true });
  mkdirSync(serverResourceDir, { recursive: true });
  cpSync(standaloneDir, serverResourceDir, { recursive: true });

  // The standalone output intentionally excludes static assets and public/ —
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/output
  const staticDir = path.join(repoRoot, ".next", "static");
  if (existsSync(staticDir)) {
    cpSync(staticDir, path.join(serverResourceDir, ".next", "static"), {
      recursive: true,
    });
  }

  const publicDir = path.join(repoRoot, "public");
  if (existsSync(publicDir)) {
    cpSync(publicDir, path.join(serverResourceDir, "public"), {
      recursive: true,
    });
  }

  console.log(`[tauri:prebuild] assembled standalone server -> ${path.relative(repoRoot, serverResourceDir)}`);
}

/**
 * `tauri.conf.json`'s `bundle.resources: ["resources/server/**\/*"]` glob is
 * also validated at build.rs time regardless of dev vs. build, and an empty
 * match is an error — so `tauri dev` needs *something* on disk here too,
 * even though it's never read in dev mode. A real build's assembleServer()
 * overwrites this directory with the actual standalone server.
 */
function ensureResourcesPlaceholder() {
  mkdirSync(serverResourceDir, { recursive: true });
  if (readdirSync(serverResourceDir).length === 0) {
    writeFileSync(path.join(serverResourceDir, ".placeholder"), "");
  }
}

function hostTargetTriple() {
  const output = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const match = output.match(/^host:\s*(\S+)/m);
  if (!match) {
    throw new Error('Could not parse a "host:" line from `rustc -vV`.');
  }
  return match[1];
}

function prepareSidecar() {
  const triple = hostTargetTriple();
  const isWindows = triple.includes("windows");
  const dest = path.join(binariesDir, `node-${triple}${isWindows ? ".exe" : ""}`);

  mkdirSync(binariesDir, { recursive: true });
  copyFileSync(process.execPath, dest);
  if (!isWindows) chmodSync(dest, 0o755);

  console.log(
    `[tauri:prebuild] bundled sidecar Node runtime -> ${path.relative(repoRoot, dest)} (copied from ${process.execPath}, Node ${process.version})`,
  );
}

if (process.argv.includes("--sidecar-only")) {
  ensureResourcesPlaceholder();
} else {
  assembleServer();
}
prepareSidecar();
