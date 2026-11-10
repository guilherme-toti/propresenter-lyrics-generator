import { test } from "node:test";
import assert from "node:assert/strict";
import { contentTypeFor, extensionOf, looksLikeMp4, planReplacement } from "./media.ts";

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

test("refuses a video onto an image slot, pointing at turning the screen into a video", () => {
  const videoOnImage = planReplacement(pngSlot, "clipe.mp4");
  assert.equal(videoOnImage.action === "refuse" && videoOnImage.reason, "media-mismatch");
  assert.match(videoOnImage.action === "refuse" ? videoOnImage.message : "", /Virar vídeo/);
});

test("an image onto an MP4 slot becomes a video, whatever its format", () => {
  for (const name of ["foto.png", "foto.JPG", "arte.webp"]) {
    assert.deepEqual(planReplacement(videoSlot, name), { action: "encode-video" }, name);
  }
});

test("an image onto a video slot of another container is refused like a video would be", () => {
  const plan = planReplacement({ mediaType: "video", fileName: "fundo.mov" }, "foto.png");
  assert.equal(plan.action === "refuse" && plan.reason, "video-format");
  assert.match(plan.action === "refuse" ? plan.message : "", /MOV/);
});

test("refuses file types it can't take, naming what fits the slot", () => {
  for (const name of ["clipe.mov", "foto.heic", "documento.pdf", "sem-extensao"]) {
    const onVideo = planReplacement(videoSlot, name);
    assert.equal(onVideo.action === "refuse" && onVideo.reason, "unsupported-source", name);
    assert.match(onVideo.action === "refuse" ? onVideo.message : "", /vídeo MP4 ou uma imagem/);

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

test("recognises an MP4 by its first box", () => {
  const mp4 = new Uint8Array([0, 0, 0, 32, ...Buffer.from("ftypisom"), 0, 0, 2, 0]);
  assert.equal(looksLikeMp4(mp4), true);
  assert.equal(looksLikeMp4(new Uint8Array([0x89, ...Buffer.from("PNG\r\n\x1a\n"), 0, 0, 0, 13])), false);
  assert.equal(looksLikeMp4(new Uint8Array([0, 0, 0, 32, ...Buffer.from("ftyp")])), false);
});
