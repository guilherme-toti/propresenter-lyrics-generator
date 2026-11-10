import { test } from "node:test";
import assert from "node:assert/strict";
import { isTopModal, pushModal, removeModal } from "./modalStack.ts";

test("only the modal opened last is on top", () => {
  const settings = pushModal();
  const picker = pushModal();
  assert.equal(isTopModal(picker), true);
  assert.equal(isTopModal(settings), false);

  removeModal(picker);
  assert.equal(isTopModal(settings), true);
  removeModal(settings);
});

test("closing a modal underneath leaves the top one on top", () => {
  const first = pushModal();
  const second = pushModal();
  removeModal(first);
  assert.equal(isTopModal(second), true);
  removeModal(second);
  removeModal(second);
  assert.equal(isTopModal(second), false);
});
