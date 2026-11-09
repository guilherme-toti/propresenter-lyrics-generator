import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyRawTextEdits,
  buildAlignmentFromAiSections,
  buildAlignmentFromManual,
  fillBlankRepeats,
  labelSections,
  restoreDroppedLines,
  type AiSection,
} from "./alignment.ts";

const raw = (...blocks: string[]) => blocks.join("\n\n");
const pairs = (rawA: string, rawB: string) => buildAlignmentFromManual(rawA, rawB).map((row) => [row.a, row.b]);

test("pairs sections by position when both sides are sung in the same order", () => {
  const result = pairs(raw("V1 en", "Chorus en", "Chorus en"), raw("V1 pt", "Refrão pt", "Refrão pt"));

  assert.deepEqual(result, [
    ["V1 en", "V1 pt"],
    ["Chorus en", "Refrão pt"],
    ["Chorus en", "Refrão pt"],
  ]);
});

test("fills every repeat the other side wrote only once with that side's own text", () => {
  const en = raw("V1 en", "Chorus en", "V2 en", "Chorus en", "Bridge en", "Bridge en", "Bridge en", "Chorus en");
  const pt = raw("V1 pt", "Refrão pt", "V2 pt", "Refrão pt", "Ponte pt", "Refrão pt");

  assert.deepEqual(pairs(en, pt), [
    ["V1 en", "V1 pt"],
    ["Chorus en", "Refrão pt"],
    ["V2 en", "V2 pt"],
    ["Chorus en", "Refrão pt"],
    ["Bridge en", "Ponte pt"],
    ["Bridge en", "Ponte pt"],
    ["Bridge en", "Ponte pt"],
    ["Chorus en", "Refrão pt"],
  ]);
});

test("follows Editor B's order when it is the side that writes out the repeats", () => {
  const result = pairs(raw("V1 pt", "Refrão pt"), raw("V1 en", "Chorus en", "Chorus en", "Chorus en"));

  assert.deepEqual(result, [
    ["V1 pt", "V1 en"],
    ["Refrão pt", "Chorus en"],
    ["Refrão pt", "Chorus en"],
    ["Refrão pt", "Chorus en"],
  ]);
});

test("keeps each repeat's own wording and line pairing on the side that wrote it out", () => {
  const en = raw("Verse one\nline two", "Holy, holy\nis the Lord", "holy holy\nIs The Lord!");
  const pt = raw("Verso um\nlinha dois", "Santo, santo\né o Senhor");

  assert.deepEqual(pairs(en, pt), [
    ["Verse one", "Verso um"],
    ["line two", "linha dois"],
    ["Holy, holy", "Santo, santo"],
    ["is the Lord", "é o Senhor"],
    ["holy holy", "Santo, santo"],
    ["Is The Lord!", "é o Senhor"],
  ]);
});

test("falls back to position when a section is genuinely missing from one side", () => {
  const result = pairs(raw("V1 en", "Chorus en", "V2 en"), raw("V1 pt", "Refrão pt"));

  assert.deepEqual(result, [
    ["V1 en", "V1 pt"],
    ["Chorus en", "Refrão pt"],
    ["V2 en", ""],
  ]);
});

test("leaves the other side blank when only one side has lyrics", () => {
  const result = pairs(raw("V1 pt", "Refrão pt", "Refrão pt"), "");

  assert.deepEqual(result, [
    ["V1 pt", ""],
    ["Refrão pt", ""],
    ["Refrão pt", ""],
  ]);
});

test("labels repeats with the fuller side's arrangement", () => {
  const rows = buildAlignmentFromManual(raw("V1 pt", "Refrão pt"), raw("V1 en", "Chorus en", "Chorus en"));

  assert.deepEqual(
    rows.map((row) => row.sectionLabel),
    ["Verso 1", "Refrão", "Refrão"],
  );
});

test("treats blocks differing only in case, accents or punctuation as the same chorus", () => {
  assert.deepEqual(labelSections([["Você é santo"], ["Verso"], ["voce e santo!"]]), ["Refrão", "Verso 1", "Refrão"]);
});

const section = (label: string, ...lines: [string, string][]): AiSection => ({
  label,
  lines: lines.map(([original, translation]) => ({ original, translation })),
});
const sides = (sections: AiSection[]) => sections.map((s) => s.lines.map((line) => [line.original, line.translation]));

test("fills the blank side of an AI-kept repeat from the first time that section appears", () => {
  // The shape gpt-4o returned for a tag sung 4× in English and pasted once in Portuguese.
  const tag = (pt: string, pt2: string) => section("Refrão", ["I will call upon Your Name", pt], ["Keep my eyes above the waves", pt2]);
  const result = fillBlankRepeats([
    section("Final", ["Oh, Jesus, You're my God", "Oh, Jesus, você é meu Deus"]),
    tag("Eu invocarei seu nome", "E mantenha meus olhos acima das ondas"),
    tag("", ""),
    tag("", ""),
  ]);

  assert.deepEqual(sides(result).slice(1), [
    [["I will call upon Your Name", "Eu invocarei seu nome"], ["Keep my eyes above the waves", "E mantenha meus olhos acima das ondas"]],
    [["I will call upon Your Name", "Eu invocarei seu nome"], ["Keep my eyes above the waves", "E mantenha meus olhos acima das ondas"]],
    [["I will call upon Your Name", "Eu invocarei seu nome"], ["Keep my eyes above the waves", "E mantenha meus olhos acima das ondas"]],
  ]);
});

test("fills a blank Editor A side the same way", () => {
  const result = fillBlankRepeats([section("Refrão", ["Santo és", "Holy are You"]), section("Refrão", ["", "Holy are you!"])]);

  assert.deepEqual(sides(result)[1], [["Santo és", "Holy are you!"]]);
});

test("leaves a blank side alone when nothing earlier matches it or the line counts differ", () => {
  const sections = [
    section("Refrão", ["Holy", "Santo"]),
    section("Ponte", ["Never seen before", ""]),
    section("Refrão", ["Holy", ""], ["Holy", ""]),
  ];

  assert.deepEqual(fillBlankRepeats(sections), sections);
});

test("puts back pasted lines the model dropped, next to their neighbors and blank on the other side", () => {
  // gpt-4o's reply for the "Oceans" tag: it dropped the Portuguese ad-libs around "Oh, Jesus".
  const fromModel = [
    section("Ponte", ["Spirit lead me", "Espírito me leve"]),
    section("Outro", ["Oh, Jesus, You're my God", "Oh, Jesus, você é meu Deus"]),
    section("Final", ["I will call upon Your Name", "Eu invocarei seu nome"]),
  ];
  const pastedPt = raw("Espírito me leve", "Sim Sim SIM SIM\nOh, Jesus, você é meu Deus\nYeah, yeah, yeah, yeah", "Eu invocarei seu nome");
  const pastedEn = raw("Spirit lead me", "Oh, Jesus, You're my God", "I will call upon Your Name");

  const result = restoreDroppedLines(fromModel, pastedEn, pastedPt);

  assert.deepEqual(result.map((s) => s.label), ["Ponte", "Outro", "Final"]);
  assert.deepEqual(sides(result)[1], [
    ["", "Sim Sim SIM SIM"],
    ["Oh, Jesus, You're my God", "Oh, Jesus, você é meu Deus"],
    ["", "Yeah, yeah, yeah, yeah"],
  ]);
});

test("brings back a whole dropped section as its own section, in its pasted position", () => {
  const fromModel = [section("Verso 1", ["Verse", "Verso"]), section("Refrão", ["Chorus", "Refrão"])];

  const result = restoreDroppedLines(fromModel, raw("Verse", "Chorus"), raw("Verso", "Só em português\nOutra linha", "Refrão"));

  assert.deepEqual(result.map((s) => s.label), ["Verso 1", "Seção", "Refrão"]);
  assert.deepEqual(sides(result)[1], [
    ["", "Só em português"],
    ["", "Outra linha"],
  ]);
});

test("doesn't restore lines the model only merged, split or wrote out more times", () => {
  const fromModel = [
    section("Verso 1", ["When oceans rise my soul will rest", "Quando os oceanos subirem minha alma descansará"]),
    section("Refrão", ["Holy", "Santo és"], ["Forever", "Pra sempre"]),
    section("Refrão", ["Holy", "Santo és"], ["Forever", "Pra sempre"]),
  ];
  const pastedEn = raw("When oceans rise\nmy soul will rest", "Holy\nForever", "Holy\nForever");
  const pastedPt = raw("Quando os oceanos subirem minha alma descansará", "Santo és\nPra sempre");

  assert.deepEqual(restoreDroppedLines(fromModel, pastedEn, pastedPt), fromModel);
});

test("applies a wording edit in place, keeping blank cells and section labels", () => {
  const rows = buildAlignmentFromAiSections([
    section("Outro", ["", "Sim Sim"], ["Oh, Jesus", "Oh, Jesus, você é meu Deus"], ["", "Yeah"]),
    section("Ponte", ["Spirit lead me", "Espírito me leve"]),
  ]);

  const result = applyRawTextEdits(rows, raw("Oh, Jesus, You're my God", "Spirit lead me"), raw("Sim Sim\nOh, Jesus, você é meu Deus\nYeah", "Espírito me leve"));

  assert.ok(result);
  assert.deepEqual(
    result.map((row) => [row.sectionLabel ?? "", row.a, row.b]),
    [
      ["Outro", "", "Sim Sim"],
      ["", "Oh, Jesus, You're my God", "Oh, Jesus, você é meu Deus"],
      ["", "", "Yeah"],
      ["Ponte", "Spirit lead me", "Espírito me leve"],
    ],
  );
  assert.deepEqual(result.map((row) => row.id), rows.map((row) => row.id));
});

test("reads a blank cell mid-section the way the editor shows it, as a section break", () => {
  const rows = buildAlignmentFromAiSections([section("Verso 1", ["One", "Um"], ["Two", ""], ["Three", "Três"])]);

  const result = applyRawTextEdits(rows, raw("One\nTwo\nThree"), raw("Um!", "Três!"));

  assert.deepEqual(result?.map((row) => row.b), ["Um!", "", "Três!"]);
});

test("asks for a rebuild when an edit adds or removes a line or section", () => {
  const rows = buildAlignmentFromManual(raw("One", "Two"), raw("Um", "Dois"));

  assert.equal(applyRawTextEdits(rows, raw("One\nOne and a half", "Two"), raw("Um", "Dois")), null);
  assert.equal(applyRawTextEdits(rows, raw("One", "Two"), raw("Um")), null);
});
