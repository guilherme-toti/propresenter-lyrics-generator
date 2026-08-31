import { groupIntoSlides } from "@/lib/alignment";
import type { AlignedLine, Song } from "@/lib/types";
import { buildEmptyNotesRtf, buildLyricsRtf, type RtfTextStyle } from "./rtf";

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const MARGIN_X = 96;
const BOX_WIDTH = CANVAS_WIDTH - MARGIN_X * 2;

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function newUuid() {
  return { string: crypto.randomUUID() };
}

function nilUuid() {
  return { string: NIL_UUID };
}

/**
 * Mirrors the color convention common ProPresenter libraries use for section groups. Labels are
 * usually Portuguese ("Refrão", "Ponte", "Introdução", "Verso"...) but English ones are matched
 * too, since manually-typed or AI section labels can still come through in either language.
 */
function sectionColor(label: string): { red: number; green: number; blue: number; alpha: number } {
  const key = label.toLowerCase();
  if (key.includes("refrão") || key.includes("refrao") || key.includes("chorus")) {
    return { red: 0.8, green: 0, blue: 0.3059, alpha: 1 };
  }
  if (key.includes("ponte") || key.includes("bridge")) return { red: 0.4627, green: 0, blue: 0.8, alpha: 1 };
  if (key.includes("intro")) return { red: 0, green: 0.8, blue: 0.4, alpha: 1 };
  if (key.includes("outro") || key.includes("final") || key.includes("ending") || key.includes("tag")) {
    return { red: 0.8, green: 0.4, blue: 0, alpha: 1 };
  }
  if (key.includes("verso") || key.includes("verse")) return { red: 0, green: 0.4667, blue: 0.8, alpha: 1 };
  return { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 };
}

/** A rectangular path outline, expressed as four corner bezier points (fractional 0..1), matching real .pro files. */
function rectanglePath() {
  return {
    closed: true,
    points: [
      { point: { x: 0, y: 0 }, q0: { x: 0, y: 0 }, q1: { x: 0, y: 0 } },
      { point: { x: 1, y: 0 }, q0: { x: 1, y: 0 }, q1: { x: 1, y: 0 } },
      { point: { x: 1, y: 1 }, q0: { x: 1, y: 1 }, q1: { x: 1, y: 1 } },
      { point: { x: 0, y: 1 }, q0: { x: 0, y: 1 }, q1: { x: 0, y: 1 } },
    ],
    shape: { type: "TYPE_RECTANGLE" },
  };
}

interface TextBoxSpec {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: RtfTextStyle;
}

function buildTextElement(lines: string[], spec: TextBoxSpec) {
  const { r, g, b } = spec.style.color;
  return {
    element: {
      uuid: newUuid(),
      name: spec.name,
      bounds: { origin: { x: spec.x, y: spec.y }, size: { width: spec.width, height: spec.height } },
      rotation: 0,
      opacity: 1,
      path: rectanglePath(),
      fill: { enable: false },
      text: {
        attributes: {
          font: { name: spec.style.fontFamily, size: spec.style.fontSizePt, family: spec.style.fontFamily, face: "Regular" },
          textSolidFill: { red: r / 255, green: g / 255, blue: b / 255, alpha: 1 },
          paragraphStyle: {
            alignment: `ALIGNMENT_${spec.style.alignment.toUpperCase()}`,
            lineHeightMultiple: 1,
          },
        },
        rtfData: buildLyricsRtf(lines, spec.style, spec.width),
        verticalAlignment: "VERTICAL_ALIGNMENT_MIDDLE",
      },
    },
  };
}

const STYLE_A: Omit<RtfTextStyle, "fontSizePt"> = {
  fontFamily: "Arial",
  color: { r: 255, g: 255, b: 255 },
  bold: true,
  alignment: "center",
};

const STYLE_B: Omit<RtfTextStyle, "fontSizePt"> = {
  fontFamily: "Arial",
  color: { r: 214, g: 214, b: 214 },
  bold: false,
  alignment: "center",
};

/** Always renders both languages — the church only ever presents the bilingual pair. */
function buildSlideElements(rows: AlignedLine[]) {
  return [
    buildTextElement(rows.map((r) => r.a), {
      name: "Language A",
      x: MARGIN_X,
      y: 60,
      width: BOX_WIDTH,
      height: 460,
      style: { ...STYLE_A, fontSizePt: 72 },
    }),
    buildTextElement(rows.map((r) => r.b), {
      name: "Language B",
      x: MARGIN_X,
      y: 560,
      width: BOX_WIDTH,
      height: 460,
      style: { ...STYLE_B, fontSizePt: 54 },
    }),
  ];
}

function buildCue(rows: AlignedLine[]) {
  const label = rows.map((r) => r.a || r.b).join(" / ").slice(0, 80);
  return {
    uuid: newUuid(),
    name: label,
    completionTargetUuid: nilUuid(),
    completionActionType: "COMPLETION_ACTION_TYPE_LAST",
    completionActionUuid: nilUuid(),
    triggerTime: { time: 0 },
    isEnabled: true,
    actions: [
      {
        uuid: newUuid(),
        isEnabled: true,
        type: "ACTION_TYPE_PRESENTATION_SLIDE",
        slide: {
          presentation: {
            baseSlide: {
              elements: buildSlideElements(rows),
              // drawsBackgroundColor left false: slides stay transparent over whatever
              // background/live layer is active in ProPresenter.
              size: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
              uuid: newUuid(),
            },
            notes: { rtfData: buildEmptyNotesRtf() },
          },
        },
      },
    ],
  };
}

interface SlideGroup {
  label: string;
  slides: AlignedLine[][];
}

function groupSlidesIntoSections(slideChunks: AlignedLine[][]): SlideGroup[] {
  const groups: SlideGroup[] = [];
  slideChunks.forEach((chunk, index) => {
    const first = chunk[0];
    if ((first?.sectionBreakBefore && index > 0) || groups.length === 0) {
      groups.push({ label: first?.sectionLabel ?? `Seção ${groups.length + 1}`, slides: [chunk] });
    } else {
      groups[groups.length - 1].slides.push(chunk);
    }
  });
  return groups;
}

/** Builds the plain JS object matching rv.data.Presentation, ready for Type.fromObject(). */
export function buildPresentationObject(song: Song) {
  const slideChunks = groupIntoSlides(song.alignment, song.exportOptions.linesPerSlide);
  const slideGroups = groupSlidesIntoSections(slideChunks);

  const cues: ReturnType<typeof buildCue>[] = [];
  const cueGroups = slideGroups.map((group) => {
    const cueIdentifiers = group.slides.map((rows) => {
      const cue = buildCue(rows);
      cues.push(cue);
      return { string: cue.uuid.string };
    });
    return {
      group: {
        uuid: newUuid(),
        name: group.label,
        color: sectionColor(group.label),
      },
      cueIdentifiers,
    };
  });

  const now = Math.floor(Date.now() / 1000);

  return {
    applicationInfo: {
      platform: "PLATFORM_MACOS",
      platformVersion: { majorVersion: 14, minorVersion: 0, patchVersion: 0, build: "23A344" },
      application: "APPLICATION_PROPRESENTER",
      applicationVersion: { majorVersion: 7, minorVersion: 16, patchVersion: 2, build: "1" },
    },
    uuid: newUuid(),
    name: song.title || "Música sem título",
    lastDateUsed: { seconds: now },
    lastModifiedDate: { seconds: now },
    // isEnabled left false: no document background — slides render fully transparent.
    background: { isEnabled: false },
    selectedArrangement: nilUuid(),
    cueGroups,
    cues,
    ccli: {
      songTitle: song.title || "",
      author: song.artist || "",
      display: false,
    },
  };
}
