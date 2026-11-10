# Library audit: one song

You audit one song from the church's ProPresenter library and write what the file should become. The church presents every song in Português and English, Português first. You never edit the library and you never commit. You write `results/<id>.json`, plus any scratch files you need (a helper to build the JSON, notes) in `tmp/<id>/` inside the work folder.

Run every command from the repo root: `npm run --silent library-audit -- <command> <workDir> …`.

## The rule that matters most

**Never write a lyric line from memory, and never translate.** Every line in your result comes either from the song's `.pro` file or from a page you saved with `page`, copied exactly. `check` rejects any line it can't find in its source. Literal translations are what broke these songs in the first place.

Musixmatch is off limits, both the site and the API: it spends the church's credits. `page` refuses it.

## Tools

- `search <workDir> "<query>"`: Google through the user's browser. Calls wait their turn, so don't fire several at once.
- `page <workDir> <id> <url>`: saves a page's lyrics to `sources/<id>/<n>.txt` and prints them. Add `--full` for the whole page when the lyrics didn't come through. Good lyric pages: letras.mus.br, cifraclub.com.br, the publisher's or artist's own site (hillsong.com, bethelmusic.com…), genius.com. A YouTube or Spotify result proves a recording exists, but its page rarely has the lyrics.
- `check <workDir> <id>`: checks your result.

Keep it to about 12 searches and 10 pages per song, counting every search, including the ones that only rule a candidate out. When you hit a wall, write a follow-up instead of searching forever.

## Steps

### 1. Read the file

Read `songs/<id>.json`. `slides` is each slide's text in order. A bilingual slide usually holds its Português lines and then its English lines, but older files vary. Work out which lines are Português, which are English, and which aren't lyrics (a title or credits slide). Capitalization doesn't matter: the export uppercases every slide anyway.

### 2. Identify the song

Search 1 or 2 distinctive lines in quotes plus "letra" or "lyrics", e.g. `"tu me chamas sobre as águas" letra`. Save the best lyric page and confirm it's the same song: most lines match. Then find the **original** song: its title, its artist, and the language it was written in. A Português worship song is often a version of an English one, and the other way round.

Not identified after about 4 searches → follow-up `not-found`.

### 3. Find the recordings in each language

A *recording* is lyrics an artist or band actually sings and released (e.g. Hillsong UNITED's "Oceans" also exists in Português as "Oceanos", recorded by Ana Nóbrega and by Hillsong Em Português). These are **not** recordings:
- letras.mus.br's "Tradução" tab, and any lyric site's page titled "tradução" or "translation": those are literal translations. A publisher's own sung release is a recording even when it's labelled "tradução oficial" (hillsong.com does this).
- A fan's upload with no release behind it. letras.mus.br sometimes lists a fan-submitted version under the original artist's name ("Oceanos (Versão Em Português)" under Hillsong UNITED), so trust the publisher's own site or an artist's page for a released album over that.

Search e.g. `"<title>" versão em português`, `"<title>" english version`, `"<original title>" "<artist>" letra`. Save the page of every recording you'll compare.

Google shows YouTube titles auto-translated into the browser's language ("Until We Meet Again | 10 Years (Live)" for "Até Outra Vez | 10 Anos (Ao Vivo)"), so an English title on a YouTube result doesn't prove an English recording. Confirm it on a lyric page or the video itself.

Recordings of the same language are *the same lyrics* if they read the same line for line, ignoring capitalization, punctuation and how many times a part repeats. A word or two different in a line or two still counts as the same.

When this guide counts matching lines (the 85% and 60% below), a line *matches* when it differs by at most a word or two. Count over the file's lyric lines in that language.

### 4. Choose each column

Do this for Português and for English.

1. **The file's text in this language matches a recording** (about 85% of its lines or more) → use **that** recording: it's the version the church sings. `"origin": "web"`, with its saved page as `source`. If several recordings match, use the closest. A file line no recording has (a typo, a word the church changed) is replaced by the recording's; name it in `notes`.
2. **Otherwise, recordings exist** → pick the best known:
   - The publisher's own release (Hillsong Em Português for a Hillsong song) and the most-viewed artist (letras.mus.br shows "Exibições da letra"; YouTube shows views) usually agree. If they do, use that version.
   - If the best-known versions differ from each other, write a follow-up `versions-differ` listing each one with its artist, views and page. Small covers that differ don't matter.
   - Exception: the file has a fair amount of text in this language that's close to a recording but isn't it (roughly 60–85% of lines). Then the church may sing its own wording, so write a follow-up `file-differs` saying which lines differ.
3. **No recording exists in this language** → keep the file's text: `"origin": "file"` with no `title`. If the file has nothing in this language, set the column to `null`. If the file's text is clearly another song or garbled, write a follow-up `other`.

A recording is chosen but no page shows its lyrics → follow-up `lyrics-unavailable`.

`title` and `artist` on a column are that recording's. The title is the **main title only**: no subtitle in brackets, no "(Ao Vivo)", no "(Versão em Português)". The file name becomes the titles joined with " - ", Português first: "Oceanos - Oceans".

`original` is the song as first written: its main title, its artist, and its language (`"pt"` or `"en"`). The top-level `artist` is the song's single most known artist, usually the original one (Hillsong UNITED for "Oceanos").

### 5. Align

Write out the **full song as sung**, following the **Português recording** (the English one when Português has none). The same song can sit in several files, and they must come out alike, so the structure never depends on which file you started from. Use a lyric page that writes the song out as sung, with every repeat (letras.mus.br usually does). Publisher pages often list each section once, so take wording from them, not structure. That page's sections, order and repeats are the song's structure, even where the file skipped a verse or had only a few lines.

Pair the other column against it **by meaning**: each row's two lines must say the same thing, because the church reads them together on one slide. The structure's version sets the order, and the other column follows it.

- When the other version sings a section's lines in a different order (Português "canção em meus lábios" then "pele em meus ossos", English "skin on my bones" then "song on my tongue"), reorder the other column's lines to the structure's order. Never pair two lines that mean different things just because they're sung at the same moment.
- A line whose meaning has no match in the other version still pairs by position. That's the version's own wording, not an order problem ("És tudo para mim" with "You're inside me").

- When a section repeats (a chorus sung 3 times), write every repeat, and fill each repeat's other side with that section's text copied from where it already appears.
- A section or line only the *other* recording sings stays out. A line the structure's recording sings with no counterpart in the other (an ad-lib) keeps its own row with `""` on the other side. Never invent the missing half. In repeats, the other side copies its first pass's wording.
- Keep each page's line breaks. Join or split lines only where the two versions break them differently; when you join, keep both halves' words exactly and put a comma between them.
- Section labels in Português: "Introdução", "Verso 1", "Verso 2", "Pré-Refrão", "Refrão", "Ponte", "Final". Every pass is its own section, and a repeat keeps its label: a chorus sung 4 times is four "Refrão" sections, and a verse sung again word for word is "Verso 1" again. A *different* verse takes the next number, and a second, different bridge is "Ponte 2". Keep the page's echoes in parentheses ("(Por Ele) por Ele…") as written.
- One long line against two short ones: join the two short ones (comma between), so the row count follows the version that sets the structure.

### 6. Write and check

Write `results/<id>.json` (shapes below) and run `check`. Fix every ERROR. Read every WARNING:
- "looks like the other language": real if a line is in the wrong column. The check is a word count and can misread a short line, so ignore it when the line is right.
- "file line left out": only shows for a column kept from the file. Put the line back unless it's a title or credits slide.
- "rows have one side blank": recheck the alignment.

Still failing after two rounds of fixes → follow-up `alignment-uncertain`, saying what wouldn't line up.

Finish with one line: `<id>: <ok|followup> — <file name or reason>`.

## Result shapes

A song that's ready:

```json
{
  "status": "ok",
  "original": { "title": "Oceans", "artist": "Hillsong UNITED", "language": "en" },
  "artist": "Hillsong UNITED",
  "pt": { "origin": "web", "title": "Oceanos", "artist": "Ana Nóbrega", "source": "sources/oceanos/1.txt" },
  "en": { "origin": "web", "title": "Oceans", "artist": "Hillsong UNITED", "source": "sources/oceanos/2.txt" },
  "sections": [
    { "label": "Verso 1", "lines": [["Tua voz me chama sobre as águas", "You call me out upon the waters"]] }
  ],
  "sources": ["https://www.letras.mus.br/…", "https://hillsong.com/…"],
  "notes": "The file's Português follows Ana Nóbrega's recording; its English was a literal translation."
}
```

A follow-up, for the person who'll fix it by hand:

```json
{
  "status": "followup",
  "original": { "title": "Oceans", "artist": "Hillsong UNITED", "language": "en" },
  "reason": "versions-differ",
  "details": "Two well-known Português recordings differ in every verse: Ana Nóbrega (3.6M views, \"Tua voz me chama…\") and …",
  "sources": ["https://www.letras.mus.br/…", "https://www.letras.mus.br/…"]
}
```

`reason` is one of `not-found`, `versions-differ`, `lyrics-unavailable`, `file-differs`, `alignment-uncertain`, `other`. `original` is left out only for `not-found`. `sources` lists every lyric page you opened, or `[]` when there were none.
