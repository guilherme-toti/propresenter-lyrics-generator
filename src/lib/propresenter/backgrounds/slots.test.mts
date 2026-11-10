import { test } from "node:test";
import assert from "node:assert/strict";
import { mapMacroMedia, slotIdFor, type DecodedMacrosDocument, type DecodedPropDocument, type MacroMediaMap } from "./slots.ts";

type MacroAction = NonNullable<NonNullable<DecodedMacrosDocument["macros"]>[number]["actions"]>[number];
type DecodedMedia = NonNullable<NonNullable<MacroAction["media"]>["element"]>;

const ASSETS = "file:///Users/pma/Library/Application%20Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter/Media/Assets";

function videoMedia(url: string): DecodedMedia {
  return { url: { absoluteString: url }, video: {} };
}

function imageMedia(url: string): DecodedMedia {
  return { url: { absoluteString: url }, image: {} };
}

function propCue(uuid: string, url: string): NonNullable<DecodedPropDocument["cues"]>[number] {
  return { uuid: { string: uuid }, actions: [{ slide: { prop: { baseSlide: { elements: [{ element: { fill: { media: imageMedia(url) } } }] } } } }] };
}

function propAction(uuid: string, name: string): MacroAction {
  return { prop: { identification: { parameterUuid: { string: uuid }, parameterName: name } } };
}

function mediaAction(media: DecodedMedia): MacroAction {
  return { media: { element: media } };
}

const LOGO_PROP = "19C19466-5AD2-470C-AA38-808969FCFA57";
const VERSE_PROP = "38746A2B-884F-4C99-8A0F-8F10A6EB18A1";

/** Shaped like the church's real service: "Início" and "Fim" share a prop, "Palavra" and
 * "Palavra bíblia" share another prop over different backgrounds. */
const serviceMacros: DecodedMacrosDocument = {
  macros: [
    {
      uuid: { string: "A1000000-0000-0000-0000-000000000001" },
      name: "Início",
      color: { red: 1, blue: 0.5 },
      actions: [mediaAction(videoMedia(`${ASSETS}/inicio.mp4`)), propAction(LOGO_PROP, "Logo")],
    },
    {
      uuid: { string: "A1000000-0000-0000-0000-000000000002" },
      name: "Palavra",
      actions: [mediaAction(imageMedia(`${ASSETS}/palavra.jpg`)), propAction(VERSE_PROP, "Versículo")],
    },
    {
      uuid: { string: "A1000000-0000-0000-0000-000000000003" },
      name: "Palavra bíblia",
      actions: [mediaAction(imageMedia(`${ASSETS}/biblia.png`)), propAction(VERSE_PROP, "Versículo")],
    },
    {
      uuid: { string: "A1000000-0000-0000-0000-000000000004" },
      name: "Fim",
      actions: [mediaAction(videoMedia(`${ASSETS}/inicio.mp4`)), propAction(LOGO_PROP, "Logo")],
    },
  ],
};

const serviceProps: DecodedPropDocument = {
  cues: [propCue(LOGO_PROP, `${ASSETS}/logo.png`), propCue(VERSE_PROP, `${ASSETS}/versiculo.png`)],
};

/** Each macro's files by name, which reads far better in an assertion than slot ids. */
function filesByMacro({ slots, macros }: MacroMediaMap): Record<string, { backgrounds: string[]; props: string[] }> {
  const nameOf = (id: string) => slots.find((slot) => slot.id === id)?.fileName ?? `missing ${id}`;
  return Object.fromEntries(
    macros.map((macro) => [macro.macroName, { backgrounds: macro.backgrounds.map(nameOf), props: macro.props.map(nameOf) }]),
  );
}

test("lists one slot per file, in the order macros first use them", () => {
  const { slots } = mapMacroMedia(serviceMacros, serviceProps, { windows: false });
  assert.deepEqual(
    slots.map((slot) => [slot.fileName, slot.mediaType]),
    [
      ["inicio.mp4", "video"],
      ["logo.png", "image"],
      ["palavra.jpg", "image"],
      ["versiculo.png", "image"],
      ["biblia.png", "image"],
    ],
  );
});

test("lists each macro's background and prop files, in macro order, sharing slots between macros", () => {
  const map = mapMacroMedia(serviceMacros, serviceProps, { windows: false });
  assert.deepEqual(filesByMacro(map), {
    Início: { backgrounds: ["inicio.mp4"], props: ["logo.png"] },
    Palavra: { backgrounds: ["palavra.jpg"], props: ["versiculo.png"] },
    "Palavra bíblia": { backgrounds: ["biblia.png"], props: ["versiculo.png"] },
    Fim: { backgrounds: ["inicio.mp4"], props: ["logo.png"] },
  });
  assert.deepEqual(
    map.macros.map((macro) => macro.macroName),
    ["Início", "Palavra", "Palavra bíblia", "Fim"],
  );
  assert.equal(map.macros[0].props[0], map.macros[3].props[0]);
});

test("decodes the file URL to the path the file lives at", () => {
  const [first] = mapMacroMedia(serviceMacros, serviceProps, { windows: false }).slots;
  assert.equal(
    first.filePath,
    "/Users/pma/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/ProPresenter/Media/Assets/inicio.mp4",
  );
});

test("skips a prop action whose prop no longer exists, keeping the rest of the macro", () => {
  const macros: DecodedMacrosDocument = {
    macros: [
      {
        uuid: { string: "B2000000-0000-0000-0000-000000000001" },
        name: "Ofertório",
        actions: [propAction("DEADBEEF-0000-0000-0000-000000000000", "Apagado"), mediaAction(videoMedia(`${ASSETS}/oferta.mp4`))],
      },
    ],
  };
  assert.deepEqual(filesByMacro(mapMacroMedia(macros, serviceProps, { windows: false })), {
    Ofertório: { backgrounds: ["oferta.mp4"], props: [] },
  });
});

test("matches a prop by its cue uuid regardless of letter case", () => {
  const macros: DecodedMacrosDocument = {
    macros: [{ uuid: { string: "c3000000-0000-0000-0000-000000000001" }, name: "Logo", actions: [propAction(LOGO_PROP.toLowerCase(), "Logo")] }],
  };
  const { slots, macros: mapped } = mapMacroMedia(macros, serviceProps, { windows: false });
  assert.equal(slots[0].fileName, "logo.png");
  assert.equal(mapped[0].macroUuid, "C3000000-0000-0000-0000-000000000001");
  assert.deepEqual(mapped[0].props, [slots[0].id]);
});

test("leaves out macros with no media or prop actions, and media that isn't an image or video", () => {
  const macros: DecodedMacrosDocument = {
    macros: [
      { uuid: { string: "D4000000-0000-0000-0000-000000000001" }, name: "Só limpa", actions: [{}] },
      {
        uuid: { string: "D4000000-0000-0000-0000-000000000002" },
        name: "Áudio",
        actions: [{ media: { element: { url: { absoluteString: `${ASSETS}/hino.mp3` } } } }],
      },
      { uuid: { string: "D4000000-0000-0000-0000-000000000003" }, name: "Sem ações" },
    ],
  };
  assert.deepEqual(mapMacroMedia(macros, {}, { windows: false }), { slots: [], macros: [] });
});

test("a file shown as a background by one macro and inside a prop by another is one slot", () => {
  const macros: DecodedMacrosDocument = {
    macros: [
      { uuid: { string: "E5000000-0000-0000-0000-000000000001" }, name: "Como prop", actions: [propAction(LOGO_PROP, "Logo")] },
      {
        uuid: { string: "E5000000-0000-0000-0000-000000000002" },
        name: "Como fundo",
        actions: [mediaAction(imageMedia(`${ASSETS}/logo.png`))],
      },
    ],
  };
  const map = mapMacroMedia(macros, serviceProps, { windows: false });
  assert.equal(map.slots.length, 1);
  assert.deepEqual(filesByMacro(map), {
    "Como prop": { backgrounds: [], props: ["logo.png"] },
    "Como fundo": { backgrounds: ["logo.png"], props: [] },
  });
});

test("lists a macro once per file even when it shows that file twice", () => {
  const macros: DecodedMacrosDocument = {
    macros: [
      {
        uuid: { string: "F6000000-0000-0000-0000-000000000001" },
        name: "Duas vezes",
        actions: [mediaAction(videoMedia(`${ASSETS}/a.mp4`)), mediaAction(videoMedia(`${ASSETS}/a.mp4`))],
      },
    ],
  };
  const { slots, macros: mapped } = mapMacroMedia(macros, {}, { windows: false });
  assert.equal(slots.length, 1);
  assert.deepEqual(mapped[0].backgrounds, [slots[0].id]);
});

test("treats decomposed and composed accents in a URL as the same file", () => {
  const nfd = encodeURI("Louvação.mp4".normalize("NFD"));
  const nfc = encodeURI("Louvação.mp4".normalize("NFC"));
  const macros: DecodedMacrosDocument = {
    macros: [
      { uuid: { string: "A7000000-0000-0000-0000-000000000001" }, name: "Um", actions: [mediaAction(videoMedia(`${ASSETS}/${nfd}`))] },
      { uuid: { string: "A7000000-0000-0000-0000-000000000002" }, name: "Dois", actions: [mediaAction(videoMedia(`${ASSETS}/${nfc}`))] },
    ],
  };
  const { slots } = mapMacroMedia(macros, {}, { windows: false });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].fileName, "Louvação.mp4".normalize("NFC"));
});

test("reads Windows file URLs as Windows paths", () => {
  const macros: DecodedMacrosDocument = {
    macros: [
      {
        uuid: { string: "A8000000-0000-0000-0000-000000000001" },
        name: "Início",
        actions: [mediaAction(videoMedia("file:///C:/Users/Igreja/Documents/ProPresenter/Media/Assets/Fundo%20Azul.mp4"))],
      },
      {
        uuid: { string: "A8000000-0000-0000-0000-000000000002" },
        name: "Fim",
        // Windows paths ignore case, so this is the same file.
        actions: [mediaAction(videoMedia("file:///c:/users/igreja/documents/propresenter/media/assets/fundo%20azul.mp4"))],
      },
    ],
  };
  const map = mapMacroMedia(macros, {}, { windows: true });
  assert.equal(map.slots.length, 1);
  assert.equal(map.slots[0].filePath, "C:\\Users\\Igreja\\Documents\\ProPresenter\\Media\\Assets\\Fundo Azul.mp4");
  assert.equal(map.slots[0].fileName, "Fundo Azul.mp4");
  assert.deepEqual(filesByMacro(map), {
    Início: { backgrounds: ["Fundo Azul.mp4"], props: [] },
    Fim: { backgrounds: ["Fundo Azul.mp4"], props: [] },
  });
});

test("gives each file an id that stays the same across reads and differs between files", () => {
  const first = mapMacroMedia(serviceMacros, serviceProps, { windows: false }).slots;
  const second = mapMacroMedia(serviceMacros, serviceProps, { windows: false }).slots;
  assert.deepEqual(
    first.map((slot) => slot.id),
    second.map((slot) => slot.id),
  );
  assert.equal(new Set(first.map((slot) => slot.id)).size, first.length);
  assert.match(first[0].id, /^[0-9a-f]{16}$/);
  assert.equal(first[0].id, slotIdFor(first[0].filePath, false));
});

test("carries each macro's ProPresenter colour as CSS", () => {
  const { macros } = mapMacroMedia(serviceMacros, serviceProps, { windows: false });
  assert.equal(macros[0].macroColor, "rgb(255 0 128)");
  assert.equal(macros[1].macroColor, null);
});

test("ignores URLs that aren't files on disk", () => {
  const macros: DecodedMacrosDocument = {
    macros: [
      {
        uuid: { string: "A9000000-0000-0000-0000-000000000001" },
        name: "Web",
        actions: [mediaAction(videoMedia("https://example.com/fundo.mp4")), mediaAction(videoMedia(""))],
      },
    ],
  };
  assert.deepEqual(mapMacroMedia(macros, {}, { windows: false }), { slots: [], macros: [] });
});
