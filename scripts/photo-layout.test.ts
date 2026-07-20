import assert from "node:assert/strict";

import {
  computePhotoLayout,
  createPhotoLayoutOptions,
  generatePhotoLayoutCandidates,
  isPhotoLayoutSpecValid,
} from "../lib/photo-layout.ts";

const sets = [
  [1],
  [4 / 3, 3 / 4],
  [16 / 9, 3 / 4, 1],
  [0.12, 8, 1, 0.3, 3, 0.8, 1.5, 0.5, 2],
];

for (const ratios of sets) {
  const candidates = generatePhotoLayoutCandidates(ratios);
  assert.ok(candidates.length >= 1 && candidates.length <= 3);
  for (const candidate of candidates) {
    assert.equal(isPhotoLayoutSpecValid(candidate, Math.min(9, ratios.length)), true);
    for (const width of [320, 480, 680]) {
      const layout = computePhotoLayout(candidate, ratios, width, 8);
      assert.equal(layout.rects.length, Math.min(9, ratios.length));
      assert.ok(Number.isFinite(layout.height) && layout.height > 0);
      for (const rect of layout.rects) {
        assert.ok(rect.width > 0 && rect.height > 0);
        assert.ok(rect.x >= -0.001 && rect.y >= -0.001);
        assert.ok(rect.x + rect.width <= width + 0.01);
        assert.ok(rect.y + rect.height <= layout.height + 0.01);
        assert.ok(
          Math.abs(rect.width / rect.height - ratios[rect.index]) < 0.0001,
        );
      }
    }
  }
}

const stable = generatePhotoLayoutCandidates([1.5, 0.8, 1.2, 0.7])[0];
assert.equal(isPhotoLayoutSpecValid(stable, 4), true);
assert.deepEqual(
  createPhotoLayoutOptions([0.7, 1.2, 0.8, 1.5], stable)[0],
  stable,
);
assert.equal(
  computePhotoLayout(stable, [0.7, 1.2, 0.8, 1.5], 480).rects.length,
  4,
);

console.log("photo layout invariants passed");
