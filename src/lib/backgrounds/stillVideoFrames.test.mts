import { test } from "node:test";
import assert from "node:assert/strict";
import { evenSize, fitsVideoLevel, rgbaToI420, toBase64 } from "./stillVideoFrames.ts";

/** A width×height image of one colour. */
function solid(width: number, height: number, [r, g, b]: [number, number, number]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) rgba.set([r, g, b, 255], offset);
  return rgba;
}

function planes(i420: Uint8ClampedArray, width: number, height: number) {
  const luma = width * height;
  const chroma = luma / 4;
  return { y: i420[0], u: i420[luma], v: i420[luma + chroma], length: i420.length };
}

test("keeps the image's size, dropping only an odd last row or column", () => {
  assert.deepEqual(evenSize(2304, 1152), { width: 2304, height: 1152 });
  assert.deepEqual(evenSize(513, 1151), { width: 512, height: 1150 });
});

test("takes frames up to 4096×2304, the largest H.264 level 5.1 allows", () => {
  assert.equal(fitsVideoLevel(2304, 1152), true);
  assert.equal(fitsVideoLevel(4096, 2304), true);
  assert.equal(fitsVideoLevel(3840, 2160), true);
  assert.equal(fitsVideoLevel(4096, 2320), false);
  assert.equal(fitsVideoLevel(8704, 64), false);
});

test("black, white and grey stay full range: 0 and 255, no TV-range 16 and 235", () => {
  assert.deepEqual(planes(rgbaToI420(solid(2, 2, [0, 0, 0]), 2, 2), 2, 2), { y: 0, u: 128, v: 128, length: 6 });
  assert.deepEqual(planes(rgbaToI420(solid(2, 2, [255, 255, 255]), 2, 2), 2, 2), { y: 255, u: 128, v: 128, length: 6 });
  assert.deepEqual(planes(rgbaToI420(solid(4, 2, [128, 128, 128]), 4, 2), 4, 2), { y: 128, u: 128, v: 128, length: 12 });
});

test("saturated colours clamp at the edge instead of wrapping around", () => {
  const blue = planes(rgbaToI420(solid(2, 2, [0, 0, 255]), 2, 2), 2, 2);
  assert.equal(blue.u, 255);
  const red = planes(rgbaToI420(solid(2, 2, [255, 0, 0]), 2, 2), 2, 2);
  assert.equal(red.v, 255);
  // Yellow sits at the other end (0.5 before rounding), never wrapped up near 255.
  const yellow = planes(rgbaToI420(solid(2, 2, [255, 255, 0]), 2, 2), 2, 2);
  assert.ok(yellow.u <= 1, String(yellow.u));
});

test("BT.709 weights: green carries most of the brightness", () => {
  assert.equal(planes(rgbaToI420(solid(2, 2, [0, 255, 0]), 2, 2), 2, 2).y, 182);
  assert.equal(planes(rgbaToI420(solid(2, 2, [255, 0, 0]), 2, 2), 2, 2).y, 54);
});

test("averages each 2×2 block for colour", () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255]);
  const i420 = rgbaToI420(rgba, 2, 2);
  assert.deepEqual([...i420.subarray(0, 4)], [54, 54, 18, 18]);
  // Half red, half blue: purple, a little of each chroma above neutral.
  assert.ok(i420[4] > 128 && i420[5] > 128);
});

test("encodes to base64, including files bigger than one chunk", () => {
  assert.equal(toBase64(new Uint8Array([0, 1, 2, 250, 255])), Buffer.from([0, 1, 2, 250, 255]).toString("base64"));
  const big = new Uint8Array(100_000).map((_, index) => index % 256);
  assert.equal(toBase64(big), Buffer.from(big).toString("base64"));
});
