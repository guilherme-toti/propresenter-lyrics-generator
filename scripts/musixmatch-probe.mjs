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
const targetLang = (args.find((a) => a.startsWith("--lang=")) ?? "--lang=en").split("=")[1];

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

// 1. `q` searches titles, artists and lyrics together and weights titles heavily, which is why
// a lyric snippet can return songs whose *title* merely resembles it. `q_lyrics` searches the
// lyrics index alone. Run both on the same input so the difference is visible.
const genreId = (args.find((a) => a.startsWith("--genre=")) ?? "--genre=").split("=")[1];
const filters = { f_has_lyrics: "1", page_size: "5", ...(genreId ? { f_music_genre_id: genreId } : {}) };

const show = (label, tracks) => {
  console.log(`\n--- ${label} ---`);
  if (tracks.length === 0) return console.log("(nenhum resultado)");
  tracks.forEach((t, i) =>
    console.log(
      `${i + 1}. "${t.track_name}" — ${t.artist_name}  [id=${t.commontrack_id}, idioma=${t.lyrics_language || "?"}]`,
    ),
  );
};
const listOf = (r) => (r.body?.track_list ?? []).map((t) => t.track);

console.log(`\n=== 1. busca  "${query}"${genreId ? `  (gênero ${genreId})` : ""} ===`);
const broad = await call("track.search", { q: query, ...filters });
const byLyrics = await call("track.search", { q_lyrics: query, ...filters });
show(`q (título + artista + letra)  [${explain(broad.status)}]`, listOf(broad));
show(`q_lyrics (só letra)  [${explain(byLyrics.status)}]`, listOf(byLyrics));

// Prefer the lyrics-only hit when there is one — that's the hypothesis under test.
const tracks = listOf(byLyrics).length ? listOf(byLyrics) : listOf(broad);
if (tracks.length === 0) {
  console.log("\nNenhum resultado em nenhuma das duas buscas.");
  process.exit(0);
}

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

// 3. selected_language is the parameter (the alternatives answered 400). Ask for a language
// *different* from the lyrics', or the endpoint just echoes the original back.
console.log(`\n=== 3. track.lyrics.translation.get  (selected_language="${targetLang}") ===`);
const translated = await call("track.lyrics.translation.get", {
  commontrack_id: String(chosen.commontrack_id),
  selected_language: targetLang,
});
console.log(`status: ${explain(translated.status)}`);
// The docs promise "both the lyrics and its translation" but never name the fields, so print
// the structure instead of guessing which one holds the translated text.
console.log("\nEstrutura da resposta:");
console.log(JSON.stringify(translated.body, null, 2).slice(0, 2500));

// 4. The genre ids available for f_music_genre_id, so the search can be narrowed to worship.
console.log("\n=== 4. music.genres.get — gêneros com cara de cristão/gospel ===");
const genres = await call("music.genres.get", {});
const list = (genres.body?.music_genre_list ?? [])
  .map((g) => g.music_genre)
  .filter((g) => /christ|gospel|religio|worship|espirit/i.test(g?.music_genre_name ?? ""));
if (list.length === 0) console.log("(nenhum correspondeu — rode com --all-genres para ver todos)");
list.forEach((g) => console.log(`id=${g.music_genre_id}  ${g.music_genre_name}`));
if (args.includes("--all-genres")) {
  console.log("\n--- todos ---");
  (genres.body?.music_genre_list ?? []).forEach((g) =>
    console.log(`id=${g.music_genre.music_genre_id}  ${g.music_genre.music_genre_name}`),
  );
}
