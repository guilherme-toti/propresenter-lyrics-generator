import { test } from "node:test";
import assert from "node:assert/strict";
import { artistFromCredits } from "./importedArtist.ts";

test("takes the CCLI author over the artist credits", () => {
  assert.equal(artistFromCredits({ author: "Hillsong United", artistCredits: "Hillsong Worship" }), "Hillsong United");
});

test("falls back to the artist credits when the file has no author", () => {
  assert.equal(artistFromCredits({ author: "", artistCredits: "Hillsong Worship" }), "Hillsong Worship");
});

test("leaves the artist empty when the file credits no one", () => {
  assert.equal(artistFromCredits({ author: "", artistCredits: "" }), "");
});
