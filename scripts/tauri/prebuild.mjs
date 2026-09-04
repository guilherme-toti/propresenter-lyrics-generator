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
  mkdtempSync,
  readdirSync,
  rmSync,
  cpSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
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

  pruneMuslNativeBinaries(path.join(serverResourceDir, "node_modules"));

  console.log(`[tauri:prebuild] assembled standalone server -> ${path.relative(repoRoot, serverResourceDir)}`);
}

/**
 * `npm ci` on Linux installs BOTH the glibc and musl builds of packages with
 * platform-conditional native binaries (confirmed for sharp: `npm ci` on a real
 * glibc Ubuntu box still installs `@img/sharp-linuxmusl-x64` alongside
 * `@img/sharp-linux-x64` — npm's optional-dependency resolution doesn't filter
 * by libc flavor), and Next's standalone-output tracer can't statically tell
 * which one sharp's own runtime `require()` will pick, so it conservatively
 * bundles both. Our sidecar Node is always a standard glibc build (see
 * prepareSidecar() below) — the musl one can never actually load under it — but
 * its mere presence in the AppDir breaks the Linux release: linuxdeploy scans
 * every ELF file for shared-library deps to bundle into the AppImage, and dies
 * because `libc.musl-x86_64.so.1` isn't a real library on a glibc system
 * ("ERROR: Could not find dependency: libc.musl-x86_64.so.1" in a `tauri build
 * -vv` log, surfacing only as "failed to run linuxdeploy" at normal verbosity).
 * Pruning them is a no-op for runtime behavior and unblocks the AppImage build.
 */
function pruneMuslNativeBinaries(dir) {
  if (!existsSync(dir)) return;
  const removed = [];

  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(current, entry.name);
      if (/musl/i.test(entry.name)) {
        rmSync(full, { recursive: true, force: true });
        removed.push(path.relative(repoRoot, full));
        continue;
      }
      walk(full);
    }
  }
  walk(dir);

  if (removed.length > 0) {
    console.log(
      `[tauri:prebuild] pruned musl-libc native binaries (dead weight — our sidecar Node is always glibc):\n  ${removed.join("\n  ")}`,
    );
  }
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

  return triple;
}

/**
 * `tauri build --target universal-apple-darwin` (see .github/workflows/release.yml)
 * compiles two separate sub-binaries (x86_64 + aarch64) and lipos them together —
 * but externalBin resources aren't merged: Tauri's build.rs validates that a
 * `binaries/node-<triple>` file exists for EACH sub-triple individually (confirmed
 * by the CI failure this fixes: "resource path 'binaries/node-x86_64-apple-darwin'
 * doesn't exist" when building on an aarch64 runner — see
 * https://v2.tauri.app/develop/sidecar/). `process.execPath` only ever gives us the
 * host's own architecture, so the other one has to come from an official Node.js
 * download instead of a copy.
 */
async function ensureOtherMacTriple(hostTriple) {
  if (process.platform !== "darwin") return;
  const otherTriple = hostTriple === "aarch64-apple-darwin" ? "x86_64-apple-darwin" : "aarch64-apple-darwin";
  const otherArch = otherTriple.startsWith("aarch64") ? "arm64" : "x64";
  const dest = path.join(binariesDir, `node-${otherTriple}`);
  if (existsSync(dest)) return;

  const version = process.version;
  const tarballName = `node-${version}-darwin-${otherArch}.tar.gz`;
  const url = `https://nodejs.org/dist/${version}/${tarballName}`;
  console.log(`[tauri:prebuild] downloading ${otherTriple} Node sidecar for the universal macOS build -> ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url} for the universal macOS sidecar: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pma-node-sidecar-"));
  const tarballPath = path.join(tmpDir, tarballName);
  writeFileSync(tarballPath, buffer);
  execFileSync("tar", ["-xzf", tarballPath, "-C", tmpDir]);

  const extractedNode = path.join(tmpDir, `node-${version}-darwin-${otherArch}`, "bin", "node");
  mkdirSync(binariesDir, { recursive: true });
  copyFileSync(extractedNode, dest);
  chmodSync(dest, 0o755);
  rmSync(tmpDir, { recursive: true, force: true });

  console.log(`[tauri:prebuild] bundled sidecar Node runtime -> ${path.relative(repoRoot, dest)} (downloaded ${tarballName})`);
}

/**
 * Compiling for `universal-apple-darwin` needs the two per-triple sidecars above
 * (one per `cargo build` sub-invocation) — but the *bundling* step that follows
 * looks up the externalBin by the pseudo-target name itself, wanting a single
 * `binaries/node-universal-apple-darwin` lipo'd fat binary (confirmed by the CI
 * failure this fixes: "Failed to copy external binaries: resource path
 * `binaries/node-universal-apple-darwin` doesn't exist", which only surfaces
 * *after* both architectures already compiled successfully).
 */
function ensureUniversalMacBinary() {
  if (process.platform !== "darwin") return;
  const dest = path.join(binariesDir, "node-universal-apple-darwin");
  if (existsSync(dest)) return;

  const aarch64Path = path.join(binariesDir, "node-aarch64-apple-darwin");
  const x64Path = path.join(binariesDir, "node-x86_64-apple-darwin");
  execFileSync("lipo", ["-create", "-output", dest, aarch64Path, x64Path]);
  chmodSync(dest, 0o755);

  console.log(`[tauri:prebuild] merged universal sidecar Node runtime -> ${path.relative(repoRoot, dest)}`);
}

async function main() {
  const isSidecarOnly = process.argv.includes("--sidecar-only");
  if (isSidecarOnly) {
    ensureResourcesPlaceholder();
  } else {
    assembleServer();
  }
  const hostTriple = prepareSidecar();
  // Only the full `tauri build` needs the second macOS architecture (for
  // `--target universal-apple-darwin`) — skip it for `tauri:dev`'s fast,
  // network-free --sidecar-only path, which never builds a universal binary.
  if (!isSidecarOnly) {
    await ensureOtherMacTriple(hostTriple);
    ensureUniversalMacBinary();
  }
}

await main();
