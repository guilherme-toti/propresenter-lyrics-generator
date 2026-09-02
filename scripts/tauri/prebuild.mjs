#!/usr/bin/env node
// Runs as Tauri's `beforeBuildCommand` (see src-tauri/tauri.conf.json).
// Assembles the Next.js standalone server + copies the current Node binary
// into place as the sidecar Tauri bundles into the installer. Both outputs
// are build artifacts (gitignored) — this script must run before every
// `tauri build`.

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
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

assembleServer();
prepareSidecar();
