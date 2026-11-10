# Library audit

Checks every song in a ProPresenter library and rewrites each one as a bilingual Português/English presentation in the app's own format (2 lines per slide, uppercase).

For each song, a Claude agent:

1. identifies the song by Googling its lyrics;
2. finds its recordings in Português and in English;
3. for each language, uses the recording the church's file matches, or else the best-known one (the publisher's own release, the most-viewed artist). The full song as published replaces wrong or literal translations and partial files. The file's own text stays only for a language with no recording;
4. aligns both languages line by line, renames the file "Português title - English title" (main titles only) and credits the song's most known artist.

Anything it can't settle (song not found, best-known recordings that disagree, wording the church may have changed, alignment it isn't sure of) becomes a follow-up for a person, and that file is left as it is.

The code here only reads and writes files. The judgment is in [`AGENT.md`](AGENT.md), the procedure each agent follows. Lyrics come only from the file or from pages saved with `page`, and `check` rejects any line it can't find in one of them. Musixmatch isn't used, because its requests spend the church's credits.

## Requirements

- The Aside browser and its `aside` CLI, running and signed in. Google searches and lyric pages go through it, because lyric sites refuse scripted requests.
- A copy of the library on this machine. Keep the work folder **outside** ProPresenter's `Libraries` folder, or ProPresenter lists it as one more library.

## Run it

```bash
WORK=~/library-audit

# 1. Read every .pro of each library folder into $WORK/songs
npm run --silent library-audit -- export $WORK "/path/to/Libraries/Louvor"

# 2. Research every song: one Claude agent per id from
npm run --silent library-audit -- check $WORK --pending
#    each following scripts/library-audit/AGENT.md, several in parallel

# 3. Review $WORK/report.md: follow-ups, errors, the new file names, duplicates merged
npm run --silent library-audit -- check $WORK

# 4. See what would be written, then write it
npm run --silent library-audit -- apply $WORK
npm run --silent library-audit -- apply $WORK --yes
```

`apply` refuses while any song is pending or has errors. With `--yes` it copies each library to `$WORK/backup/<time>/`, moves every file it replaces to `$WORK/replaced/<time>/`, and writes the new files. Follow-ups are never touched. When the same song is kept twice (an English-only "Oceans" and a Português-only "Oceanos"), both become one "Oceanos - Oceans" file built from the more complete of the two.

## Commands

| Command | Does |
| --- | --- |
| `export <work> <folder>…` | Writes `songs/<id>.json` per `.pro` file (re-running keeps the same ids) |
| `search <work> "<query>"` | Googles through Aside. Calls queue across agents, 6 s apart (Aside allows 6 per 30 s), with one retry, since parallel searches trip a CAPTCHA |
| `page <work> <id> <url>` | Saves a page's text to `sources/<id>/<n>.txt` and prints it |
| `check <work> <id>` | Checks one result: errors block `apply`, warnings are for a person |
| `check <work>` | Checks all, writes `report.md` |
| `check <work> --pending` | Prints the ids with no result yet |
| `apply <work> [--yes]` | Plans, or with `--yes` backs up and writes |
| `apply <work> --only=<id>,… [--yes]` | The same for only these songs, to redo some after a review (fix `results/<id>.json`, `check`, then apply) |

Tests: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/library-audit/loader.mjs --test scripts/library-audit/*.test.mts`. The loader lets Node run the app's own modules (`@/` imports, no file extensions), so the CLI reuses the app's decoder, encoder and alignment instead of copies.
