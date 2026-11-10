import { test } from "node:test";
import assert from "node:assert/strict";
import { contentTypeFor, extensionOf, planReplacement } from "./media.ts";

const videoSlot = { mediaType: "video" as const, fileName: "fundo-teste.mp4" };
const pngSlot = { mediaType: "image" as const, fileName: "prop-teste.png" };
const jpgSlot = { mediaType: "image" as const, fileName: "5X1A0247.jpg" };

test("copies a file of the same kind and extension as-is", () => {
  assert.deepEqual(planReplacement(videoSlot, "novo-fundo.mp4"), { action: "copy" });
  assert.deepEqual(planReplacement(pngSlot, "novo.png"), { action: "copy" });
});

test("ignores extension case", () => {
  assert.deepEqual(planReplacement(videoSlot, "NOVO.MP4"), { action: "copy" });
  assert.deepEqual(planReplacement(pngSlot, "Logo.PNG"), { action: "copy" });
});

test("copies between extensions that name the same image format", () => {
  assert.deepEqual(planReplacement(jpgSlot, "foto.jpeg"), { action: "copy" });
  assert.deepEqual(planReplacement({ mediaType: "image", fileName: "a.tiff" }, "b.tif"), { action: "copy" });
});

test("converts an image of another format to the slot's format", () => {
  assert.deepEqual(planReplacement(pngSlot, "foto.jpg"), { action: "convert", format: "png" });
  assert.deepEqual(planReplacement(jpgSlot, "arte.webp"), { action: "convert", format: "jpeg" });
  assert.deepEqual(planReplacement(jpgSlot, "arte.png"), { action: "convert", format: "jpeg" });
});

test("refuses a video onto an image slot, and the reverse", () => {
  const videoOnImage = planReplacement(pngSlot, "clipe.mp4");
  assert.equal(videoOnImage.action, "refuse");
  assert.equal(videoOnImage.action === "refuse" && videoOnImage.reason, "media-mismatch");

  const imageOnVideo = planReplacement(videoSlot, "foto.png");
  assert.equal(imageOnVideo.action === "refuse" && imageOnVideo.reason, "media-mismatch");
  assert.match(imageOnVideo.action === "refuse" ? imageOnVideo.message : "", /MP4/);
});

test("refuses file types it can't take, naming what fits the slot", () => {
  for (const name of ["clipe.mov", "foto.heic", "documento.pdf", "sem-extensao"]) {
    const onVideo = planReplacement(videoSlot, name);
    assert.equal(onVideo.action === "refuse" && onVideo.reason, "unsupported-source", name);
    assert.match(onVideo.action === "refuse" ? onVideo.message : "", /vídeo MP4/);

    const onImage = planReplacement(pngSlot, name);
    assert.equal(onImage.action === "refuse" && onImage.reason, "unsupported-source", name);
    assert.match(onImage.action === "refuse" ? onImage.message : "", /PNG, JPG ou WebP/);
  }
});

test("refuses an MP4 onto a video slot of another container, saying which one it is", () => {
  const plan = planReplacement({ mediaType: "video", fileName: "fundo.mov" }, "novo.mp4");
  assert.equal(plan.action === "refuse" && plan.reason, "video-format");
  assert.match(plan.action === "refuse" ? plan.message : "", /MOV/);
});

test("refuses converting to an image format it can't write", () => {
  const plan = planReplacement({ mediaType: "image", fileName: "logo.bmp" }, "novo.png");
  assert.equal(plan.action === "refuse" && plan.reason, "image-format");
  assert.match(plan.action === "refuse" ? plan.message : "", /BMP/);
});

test("reads extensions from file names", () => {
  assert.equal(extensionOf("Fundo Azul.MP4"), "mp4");
  assert.equal(extensionOf("arquivo.tar.gz"), "gz");
  assert.equal(extensionOf("sem-extensao"), "");
  assert.equal(extensionOf(".oculto"), "");
});

test("serves previews with the type the browser needs", () => {
  assert.equal(contentTypeFor("fundo.mp4"), "video/mp4");
  assert.equal(contentTypeFor("foto.JPG"), "image/jpeg");
  assert.equal(contentTypeFor("desconhecido.xyz"), null);
  assert.equal(contentTypeFor("sem-extensao"), null);
});
