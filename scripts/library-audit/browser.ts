import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

/**
 * Google and lyric pages are read through Aside, the user's own browser: lyric sites refuse plain
 * scripted requests (letras.mus.br answers 403), and Google has to see a real profile. Agents run in
 * parallel but Aside's Google search must not (parallel queries trip a CAPTCHA), so every browser
 * call here waits for one shared lock in the work folder.
 */

const run = promisify(execFile);

const ASIDE_TIMEOUT_MS = 150_000;
/** Pause between two Google queries, on top of the lock. Aside allows 6 searches per 30 s and
 * reports going over as "Google Search HTML parsing failed", so stay just under it. */
const GOOGLE_GAP_MS = 6_000;
/** Wait before the fallback read of the results page, once Aside's rate window has cleared. */
const GOOGLE_RETRY_MS = 15_000;
/** A lock older than this was left by a crashed run. */
const STALE_LOCK_MS = 5 * 60_000;
const START = "<<<library-audit>>>";
const END = "<<<end>>>";

/** Hosts never read: Musixmatch is paid per request on this account's key. */
const BLOCKED_HOSTS = ["musixmatch.com"];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withBrowserLock<T>(workDir: string, task: () => Promise<T>): Promise<T> {
  const lockPath = path.join(workDir, ".browser.lock");
  for (;;) {
    try {
      await (await fs.open(lockPath, "wx")).close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stat = await fs.stat(lockPath).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > STALE_LOCK_MS) await fs.rm(lockPath, { force: true });
      await sleep(300 + Math.random() * 700);
    }
  }
  try {
    return await task();
  } finally {
    await fs.rm(lockPath, { force: true });
  }
}

/** Runs one Aside REPL snippet that prints its answer between START and END. */
async function runAside<T>(code: string, schema: z.ZodType<T>): Promise<T> {
  const { stdout } = await run("aside", ["repl", code], { timeout: ASIDE_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
  const start = stdout.indexOf(START);
  const end = stdout.indexOf(END, start);
  if (start === -1 || end === -1) throw new Error(`Aside gave no answer:\n${stdout.slice(0, 2000)}`);
  return schema.parse(JSON.parse(stdout.slice(start + START.length, end)));
}

function printAnswer(expression: string): string {
  return `console.log(${JSON.stringify(START)} + JSON.stringify(${expression}) + ${JSON.stringify(END)});`;
}

const searchResultsSchema = z.array(z.object({ title: z.string(), url: z.string(), snippet: z.string() }));
export type SearchResult = z.infer<typeof searchResultsSchema>[number];

export async function googleSearch(workDir: string, query: string): Promise<SearchResult[]> {
  return withBrowserLock(workDir, async () => {
    const stampPath = path.join(workDir, ".google-last");
    const last = Number(await fs.readFile(stampPath, "utf8").catch(() => "0"));
    const wait = last + GOOGLE_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    const viaParser = () =>
      runAside(
        `const found = await googleSearch.search(${JSON.stringify(query)}, { limit: 8 });
         ${printAnswer("found.map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: r.snippet ?? '' }))")}`,
        searchResultsSchema,
      );
    // Aside's parser fails ("Google Search HTML parsing failed") on a results page that opens with
    // an AI Overview, and when over its rate limit; the page itself still lists the results, each
    // an external link around an <h3>.
    const viaPage = () =>
      runAside(
        `const tab = await openTab(${JSON.stringify(`https://www.google.com/search?q=${encodeURIComponent(query)}`)});
         try {
           const found = await tab.evaluate(() =>
             [...document.querySelectorAll("a:has(h3)")]
               .map((a) => ({ title: a.querySelector("h3").innerText, url: a.href, snippet: "" }))
               .filter((r) => r.url.startsWith("http") && !new URL(r.url).hostname.endsWith("google.com"))
               .slice(0, 8));
           ${printAnswer("found")}
         } finally {
           await closeTab(tab);
         }`,
        searchResultsSchema,
      );
    try {
      const results = await viaParser().catch(async () => {
        await sleep(GOOGLE_RETRY_MS);
        return viaPage();
      });
      if (results.length === 0) throw new Error("Google returned no results — it may be showing a CAPTCHA in Aside.");
      return results.filter((result) => !isBlockedUrl(result.url));
    } finally {
      await fs.writeFile(stampPath, String(Date.now()));
    }
  });
}

const pageSchema = z.object({ url: z.string(), title: z.string(), text: z.string() });
export type PageText = z.infer<typeof pageSchema>;

function isBlockedUrl(url: string): boolean {
  const host = URL.parse(url)?.hostname.toLowerCase() ?? "";
  return BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function assertReadableUrl(url: string): void {
  const parsed = URL.parse(url);
  if (parsed?.protocol !== "https:" && parsed?.protocol !== "http:") throw new Error(`Not a web page: ${url}`);
  if (isBlockedUrl(url)) throw new Error(`${parsed.hostname} is off limits: Musixmatch requests spend the church's credits.`);
}

/**
 * Where lyric sites keep the lyrics. `article` comes first because on letras.mus.br it also holds
 * the view count and the composers, which tell the best-known recording and whose song a version
 * is; on cifraclub.com.br it's the lyrics alone. Reading only that leaves out the menus, version
 * lists and footers an agent would otherwise wade through on every page.
 */
const LYRIC_SELECTORS = ["article", ".lyric-original", '[data-lyrics-container="true"]'];
/** Shorter than this, the matched element is a teaser, not the lyrics: fall back to the page. */
const MIN_LYRIC_LENGTH = 80;

/** cifraclub.com.br starts every line with a zero-width space, which would end up on the slides. */
const INVISIBLE_CHARACTERS = /[​-‍﻿]/g;

/** The page's lyrics (or, with `full` or no known lyric element, all its visible text), as the
 * browser renders them, line breaks included. */
export async function readPage(workDir: string, url: string, full: boolean): Promise<PageText> {
  assertReadableUrl(url);
  const page = await withBrowserLock(workDir, () =>
    runAside(
      `const tab = await openTab(${JSON.stringify(url)});
       try {
         const text = await tab.evaluate(({ selectors, minLength, full }) => {
           if (!full) {
             for (const selector of selectors) {
               const parts = [...document.querySelectorAll(selector)].map((el) => el.innerText.trim()).filter(Boolean);
               const lyrics = parts.join("\\n\\n");
               if (lyrics.length >= minLength) return lyrics;
             }
           }
           return document.body.innerText;
         }, ${JSON.stringify({ selectors: LYRIC_SELECTORS, minLength: MIN_LYRIC_LENGTH, full })});
         ${printAnswer("{ url: tab.url(), title: await tab.title(), text }")}
       } finally {
         await closeTab(tab);
       }`,
      pageSchema,
    ),
  );
  return { ...page, text: page.text.replace(INVISIBLE_CHARACTERS, "") };
}
