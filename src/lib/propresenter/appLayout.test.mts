import { test } from "node:test";
import assert from "node:assert/strict";
import { labelSections } from "../alignment.ts";
import { rowsFromAppLayout, songFromAppLayout, type AppLayoutSong } from "./appLayout.ts";
import type { DecodedCueGroup } from "./decode.ts";
import { buildLyricsRtf } from "./rtf.ts";
import { rtfToLines } from "./rtfText.ts";
import { slideLines } from "./slideText.ts";

const STYLE = { fontFamily: "Arial", fontSizePt: 72, color: { r: 255, g: 255, b: 255 }, alignment: "center" } as const;

/** One slide's text boxes the way build.ts writes them, read back the way decode.ts reads them. */
function appSlide(rows: [string, string][]) {
  const aligned = rows.map(([a, b], index) => ({ id: String(index), a, b, sectionBreakBefore: index === 0 }));
  const box = (name: string, side: "a" | "b") => ({
    name,
    lines: rtfToLines(buildLyricsRtf(slideLines(aligned, side), STYLE, 1728).toString("utf-8")),
  });
  return [box("1", "a"), box("2", "b")];
}

test("pairs Português from box 1 with English from box 2, row by row within each slide", () => {
  const slides = [
    appSlide([
      ["Tua voz me chama sobre as águas", "You call me out upon the waters"],
      ["Onde os meus pés podem falhar", "The great unknown where feet may fail"],
    ]),
    appSlide([["Pois eu sou Teu e Tu és meu!", "For I am Yours and You are mine"]]),
  ];

  assert.deepEqual(rowsFromAppLayout(slides), [
    [
      { a: "TUA VOZ ME CHAMA SOBRE AS ÁGUAS", b: "YOU CALL ME OUT UPON THE WATERS" },
      { a: "ONDE OS MEUS PÉS PODEM FALHAR", b: "THE GREAT UNKNOWN WHERE FEET MAY FAIL" },
    ],
    [{ a: "POIS EU SOU TEU E TU ÉS MEU!", b: "FOR I AM YOURS AND YOU ARE MINE" }],
  ]);
});

// Word-based guessing reads "TU ME CHAMAS" as English ("me") and can't place "SE O MAR CRESCER" at all.
test("takes each line's language from its box, even when the words read as the other language", () => {
  const slides = [
    appSlide([["Tu me chamas sobre as águas", "You call me out upon the waters"]]),
    appSlide([
      ["Se o mar crescer", "When oceans rise"],
      ["Somente em Ti descansarei", "My soul will rest in Your embrace"],
    ]),
  ];

  assert.deepEqual(rowsFromAppLayout(slides), [
    [{ a: "TU ME CHAMAS SOBRE AS ÁGUAS", b: "YOU CALL ME OUT UPON THE WATERS" }],
    [
      { a: "SE O MAR CRESCER", b: "WHEN OCEANS RISE" },
      { a: "SOMENTE EM TI DESCANSAREI", b: "MY SOUL WILL REST IN YOUR EMBRACE" },
    ],
  ]);
});

test("keeps a line sung in only one language on its own row, so the next pairs don't shift", () => {
  const slides = [
    appSlide([
      ["Jesus, Tu és meu Deus!", ""],
      ["E ao Teu nome clamarei", "I will call upon Your name"],
    ]),
    appSlide([
      ["", "Oh, oh"],
      ["Somente em Ti descansarei", "My soul will rest in Your embrace"],
    ]),
  ];

  assert.deepEqual(slides[0][1].lines, ["", "I WILL CALL UPON YOUR NAME"]);
  assert.deepEqual(rowsFromAppLayout(slides), [
    [
      { a: "JESUS, TU ÉS MEU DEUS!", b: "" },
      { a: "E AO TEU NOME CLAMAREI", b: "I WILL CALL UPON YOUR NAME" },
    ],
    [
      { a: "", b: "OH, OH" },
      { a: "SOMENTE EM TI DESCANSAREI", b: "MY SOUL WILL REST IN YOUR EMBRACE" },
    ],
  ]);
});

test("reads a song kept in one language only, leaving the other side blank", () => {
  const slides = [appSlide([["", "You call me out upon the waters"]])];

  assert.deepEqual(rowsFromAppLayout(slides), [[{ a: "", b: "YOU CALL ME OUT UPON THE WATERS" }]]);
});

test("finds the boxes by name, whatever order the slide lists them in", () => {
  const [portuguese, english] = appSlide([["Se o mar crescer", "When oceans rise"]]);

  assert.deepEqual(rowsFromAppLayout([[english, portuguese]]), [[{ a: "SE O MAR CRESCER", b: "WHEN OCEANS RISE" }]]);
});

test("skips slides with no text and rows blank in both boxes", () => {
  const slides = [
    appSlide([["", ""]]),
    [{ name: "Logo", lines: [""] }],
    appSlide([
      ["Se o mar crescer", "When oceans rise"],
      ["", ""],
    ]),
  ];

  assert.deepEqual(rowsFromAppLayout(slides), [[{ a: "SE O MAR CRESCER", b: "WHEN OCEANS RISE" }]]);
});

test("leaves a file with another layout to the language guess", () => {
  const appSlides = [appSlide([["Se o mar crescer", "When oceans rise"]])];

  assert.equal(rowsFromAppLayout([[{ name: "Text", lines: ["SE O MAR CRESCER", "WHEN OCEANS RISE"] }]]), null);
  assert.equal(rowsFromAppLayout([...appSlides, [{ name: "Text", lines: ["WHEN OCEANS RISE"] }]]), null);
  assert.equal(rowsFromAppLayout([[...appSlides[0], { name: "3", lines: ["CCLI 123"] }]]), null);
  assert.equal(rowsFromAppLayout([[appSlides[0][0], { ...appSlides[0][1], name: "1" }]]), null);
  assert.equal(rowsFromAppLayout([[appSlides[0][0]]]), null);
});

test("leaves a file with no text at all to the language guess", () => {
  assert.equal(rowsFromAppLayout([]), null);
  assert.equal(rowsFromAppLayout([appSlide([["", ""]])]), null);
});

/** Each section's label and its rows as "a | b", so a test reads like the editor. */
function sectionsOf(song: AppLayoutSong | null) {
  if (!song) return null;
  const sections: { label?: string; rows: string[] }[] = [];
  for (const row of song.alignment) {
    if (row.sectionBreakBefore) sections.push({ label: row.sectionLabel, rows: [] });
    sections[sections.length - 1].rows.push(`${row.a} | ${row.b}`);
  }
  return sections;
}

const group = (index: number, name: string): DecodedCueGroup => ({ index, name });

test("reads each ProPresenter group back as one section named after it, across all of its slides", () => {
  const verse = group(0, "Verso 1");
  const chorus = group(1, "Refrão");
  const slides = [
    appSlide([
      ["Tua voz me chama sobre as águas", "You call me out upon the waters"],
      ["Onde os meus pés podem falhar", "The great unknown where feet may fail"],
    ]),
    appSlide([["E ali Te encontro no mistério", "And there I find You in the mystery"]]),
    appSlide([["Ao Teu nome clamarei", "And I will call upon Your name"]]),
  ];

  assert.deepEqual(sectionsOf(songFromAppLayout(slides, [verse, verse, chorus], labelSections)), [
    {
      label: "Verso 1",
      rows: [
        "TUA VOZ ME CHAMA SOBRE AS ÁGUAS | YOU CALL ME OUT UPON THE WATERS",
        "ONDE OS MEUS PÉS PODEM FALHAR | THE GREAT UNKNOWN WHERE FEET MAY FAIL",
        "E ALI TE ENCONTRO NO MISTÉRIO | AND THERE I FIND YOU IN THE MYSTERY",
      ],
    },
    { label: "Refrão", rows: ["AO TEU NOME CLAMAREI | AND I WILL CALL UPON YOUR NAME"] },
  ]);
});

test("keeps groups that share a name apart, the way a chorus sung twice is two groups", () => {
  const slides = [
    appSlide([["Guia-me", "Spirit lead me"]]),
    appSlide([["Guia-me", "Spirit lead me"]]),
    appSlide([["Jesus, Tu és meu Deus!", "Oh, Jesus, You're my God"]]),
  ];

  assert.deepEqual(sectionsOf(songFromAppLayout(slides, [group(0, "Ponte"), group(1, "Ponte"), group(1, "Ponte")], labelSections)), [
    { label: "Ponte", rows: ["GUIA-ME | SPIRIT LEAD ME"] },
    { label: "Ponte", rows: ["GUIA-ME | SPIRIT LEAD ME", "JESUS, TU ÉS MEU DEUS! | OH, JESUS, YOU'RE MY GOD"] },
  ]);
});

test("labels a slide in no group, or in a group without a name, from its lyrics", () => {
  const chorus = [["Ao Teu nome clamarei", "And I will call upon Your name"]] as [string, string][];
  const slides = [
    appSlide(chorus),
    appSlide([["Tua graça cobre os meus temores", "Your grace abounds in deepest waters"]]),
    appSlide([["Tua forte mão me guiará", "Your sovereign hand will be my guide"]]),
    appSlide(chorus),
    appSlide([["Jesus, Tu és meu Deus!", "Oh, Jesus, You're my God"]]),
  ];
  const unnamed = group(1, "");

  assert.deepEqual(sectionsOf(songFromAppLayout(slides, [null, unnamed, unnamed, null, group(2, "Final")], labelSections)), [
    { label: "Refrão", rows: ["AO TEU NOME CLAMAREI | AND I WILL CALL UPON YOUR NAME"] },
    {
      label: "Verso 1",
      rows: ["TUA GRAÇA COBRE OS MEUS TEMORES | YOUR GRACE ABOUNDS IN DEEPEST WATERS", "TUA FORTE MÃO ME GUIARÁ | YOUR SOVEREIGN HAND WILL BE MY GUIDE"],
    },
    { label: "Refrão", rows: ["AO TEU NOME CLAMAREI | AND I WILL CALL UPON YOUR NAME"] },
    { label: "Final", rows: ["JESUS, TU ÉS MEU DEUS! | OH, JESUS, YOU'RE MY GOD"] },
  ]);
});

test("keeps a group's slides together across a slide with no text between them", () => {
  const chorus = group(0, "Refrão");
  const slides = [appSlide([["Se o mar crescer", "When oceans rise"]]), [{ name: "Logo", lines: [""] }], appSlide([["Pois eu sou Teu", "For I am Yours"]])];

  assert.deepEqual(sectionsOf(songFromAppLayout(slides, [chorus, null, chorus], labelSections)), [
    { label: "Refrão", rows: ["SE O MAR CRESCER | WHEN OCEANS RISE", "POIS EU SOU TEU | FOR I AM YOURS"] },
  ]);
});

test("leaves a file with another layout to the language guess, whatever its groups", () => {
  const slides = [[{ name: "Text", lines: ["SE O MAR CRESCER", "WHEN OCEANS RISE"] }]];

  assert.equal(songFromAppLayout(slides, [group(0, "Refrão")], labelSections), null);
  assert.equal(songFromAppLayout([], [], labelSections), null);
});

// build.ts fills every slide of a section up to the setting, so only a section's last slide holds fewer.
test("reads the lines per slide the file was exported at from its fullest slide", () => {
  const verse = group(0, "Verso 1");
  const chorus = group(1, "Refrão");
  const threePerSlide = [
    appSlide([
      ["Tua voz me chama sobre as águas", "You call me out upon the waters"],
      ["Onde os meus pés podem falhar", "The great unknown where feet may fail"],
      ["E ali Te encontro no mistério", "And there I find You in the mystery"],
    ]),
    appSlide([["Em meio ao mar, confiarei", "In oceans deep my faith will stand"]]),
    appSlide([
      ["Ao Teu nome clamarei", "And I will call upon Your name"],
      ["Em Ti descansarei", "And keep my eyes above the waves"],
    ]),
  ];
  const onePerSlide = [appSlide([["Se o mar crescer", "When oceans rise"]]), appSlide([["Pois eu sou Teu", "For I am Yours"]])];

  assert.equal(songFromAppLayout(threePerSlide, [verse, verse, chorus], labelSections)?.linesPerSlide, 3);
  assert.equal(songFromAppLayout(onePerSlide, [verse, verse], labelSections)?.linesPerSlide, 1);
});
