#!/usr/bin/env node
/**
 * Answers, against a real key, the questions the docs don't:
 *
 *   1. does searching by a *lyric snippet* find the song? (this is what would replace the AI
 *      identification step — see src/lib/lyrics/musixmatch.ts)
 *   2. does the plan return the FULL lyric body, or a truncated excerpt? (a truncated body makes
 *      the whole integration useless for building slides)
 *   3. does track.lyrics.translation.get return anything, and under which parameter name? The
 *      docs describe the endpoint but not how the target language is selected.
 *
 * Usage:
 *   MUSIXMATCH_API_KEY=xxx node scripts/musixmatch-probe.mjs "é ele quem me sustenta"
 *   MUSIXMATCH_API_KEY=xxx node scripts/musixmatch-probe.mjs "Oceans Hillsong" --lang=en
 */

const API = "https://api.musixmatch.com/ws/1.1";
const apiKey = process.env.MUSIXMATCH_API_KEY;
const args = process.argv.slice(2);
const query = args.filter((a) => !a.startsWith("--")).join(" ");
const targetLang = (args.find((a) => a.startsWith("--lang=")) ?? "--lang=pt").split("=")[1];

if (!apiKey || !query) {
  console.error('Uso: MUSIXMATCH_API_KEY=xxx node scripts/musixmatch-probe.mjs "trecho da letra" [--lang=pt]');
  process.exit(1);
}

const STATUS_MEANING = {
  400: "requisição malformada",
  401: "chave inválida / não autenticada",
  402: "limite de uso atingido",
  403: "chave desativada ou sem permissão para este endpoint (plano)",
  404: "nada encontrado",
};
const explain = (s) => (s === 200 ? "ok" : `${s} — ${STATUS_MEANING[s] ?? "?"}`);

async function call(path, params) {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("apikey", apiKey);
  let res;
  try {
    res = await fetch(url);
  } catch (error) {
    console.error(`\nFalha de rede ao chamar ${path}: ${error.message}`);
    process.exit(1);
  }
  const raw = await res.text();
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // Not JSON at all — a proxy, a captive network or an outage. Show it rather than
    // reporting it as "song not found", which is the one confusion this script must avoid.
    console.error(`\n${path} respondeu HTTP ${res.status} com algo que não é JSON:\n${raw.slice(0, 300)}`);
    process.exit(1);
  }
  const status = json?.message?.header?.status_code;
  if (status === undefined) {
    console.error(`\n${path}: resposta sem status_code (HTTP ${res.status}):\n${raw.slice(0, 300)}`);
    process.exit(1);
  }
  if (status === 401 || status === 402 || status === 403) {
    console.error(`\n${path}: ${status} — ${STATUS_MEANING[status]}. Verifique a chave e o plano antes de concluir qualquer coisa sobre o catálogo.`);
    process.exit(1);
  }
  return { status, body: json?.message?.body, httpStatus: res.status };
}

// 1. Search by whatever the user typed: q covers title, artist and lyrics at once.
console.log(`\n=== 1. track.search  q="${query}" ===`);
const search = await call("track.search", { q: query, f_has_lyrics: "1", page_size: "5" });
console.log(`status: ${explain(search.status)}`);

const tracks = (search.body?.track_list ?? []).map((t) => t.track);
if (tracks.length === 0) {
  console.log("Nenhum resultado — o catálogo não achou essa música por esse texto.");
  process.exit(0);
}
tracks.forEach((t, i) =>
  console.log(
    `${i + 1}. "${t.track_name}" — ${t.artist_name}  [commontrack_id=${t.commontrack_id}, idioma=${t.lyrics_language ?? "?"}]`,
  ),
);

// 2. Full body or excerpt? This is the make-or-break question for building slides.
const chosen = tracks[0];
console.log(`\n=== 2. track.lyrics.get  commontrack_id=${chosen.commontrack_id} ("${chosen.track_name}") ===`);
const lyrics = await call("track.lyrics.get", { commontrack_id: String(chosen.commontrack_id) });
console.log(`status: ${explain(lyrics.status)}`);

const body = lyrics.body?.lyrics?.lyrics_body ?? "";
const lines = body.split("\n").filter((l) => l.trim());
const truncated = /commercial use|\.\.\.$/i.test(body);
console.log(`linhas: ${lines.length} | caracteres: ${body.length}`);
console.log(`idioma: ${lyrics.body?.lyrics?.lyrics_language ?? "?"} | restrita: ${lyrics.body?.lyrics?.restricted ?? 0}`);
console.log(`copyright: ${lyrics.body?.lyrics?.lyrics_copyright?.trim() || "(vazio)"}`);
console.log(`pixel de tracking: ${lyrics.body?.lyrics?.pixel_tracking_url ? "presente" : "ausente"}`);
console.log(
  truncated
    ? "\n⚠️  PARECE TRUNCADA — tem marcador de excerto/uso não comercial. Nesse caso o plano não serve para montar slides."
    : "\n✅ Sem marcador de truncamento aparente.",
);
console.log("\n--- letra recebida ---");
console.log(body || "(vazia)");

// 3. Translations: the endpoint exists, but the docs don't name the language parameter.
console.log(`\n=== 3. track.lyrics.translation.get  (tentando idioma "${targetLang}") ===`);
for (const paramName of ["selected_language", "language", "translation_language"]) {
  const translated = await call("track.lyrics.translation.get", {
    commontrack_id: String(chosen.commontrack_id),
    [paramName]: targetLang,
  });
  const translation = translated.body?.lyrics?.lyrics_body ?? translated.body?.translations_list ?? "";
  const text = typeof translation === "string" ? translation : JSON.stringify(translation).slice(0, 300);
  console.log(`\n${paramName}: status ${explain(translated.status)} | ${text ? `${text.length} chars` : "vazio"}`);
  if (text) console.log(text.slice(0, 400));
}

console.log("\nPronto. O que importa: (2) veio completa? (3) algum dos parâmetros trouxe tradução?");
