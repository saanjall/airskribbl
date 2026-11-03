import test from 'node:test';
import assert from 'node:assert/strict';
import { floodFill, isEnclosed } from '../src/drawing/floodFill.js';

const SIZE = 60;
const RED = [229, 72, 77];

function blank() {
  return { width: SIZE, height: SIZE, data: new Uint8ClampedArray(SIZE * SIZE * 4).fill(255) };
}

function set(image, x, y, value) {
  const i = (y * SIZE + x) * 4;
  image.data.set([value, value, value, 255], i);
}

/** A hollow box with a black outline, optionally with a soft grey edge just inside it. */
function box(image, soft = false) {
  for (let i = 10; i <= 50; i++) {
    for (let w = 0; w < 3; w++) {
      set(image, i, 10 + w, 0);
      set(image, i, 50 - w, 0);
      set(image, 10 + w, i, 0);
      set(image, 50 - w, i, 0);
    }
  }
  if (!soft) return;
  for (let i = 13; i <= 47; i++) {
    set(image, i, 13, 200);
    set(image, i, 47, 200);
    set(image, 13, i, 200);
    set(image, 47, i, 200);
  }
}

const pixel = (image, x, y) => [...image.data.slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 3)];

test('fill stays inside a closed shape', () => {
  const image = blank();
  box(image);
  assert.equal(floodFill(image, 30, 30, RED), true);
  assert.deepEqual(pixel(image, 30, 30), RED);
  assert.deepEqual(pixel(image, 16, 16), RED);
  assert.deepEqual(pixel(image, 5, 5), [255, 255, 255], 'outside is untouched');
  assert.deepEqual(pixel(image, 11, 30), [0, 0, 0], 'the middle of the line survives');
});

test('fill outside a shape leaves the inside alone', () => {
  const image = blank();
  box(image);
  floodFill(image, 2, 2, RED);
  assert.deepEqual(pixel(image, 57, 57), RED);
  assert.deepEqual(pixel(image, 30, 30), [255, 255, 255]);
});

test('fill leaks through a gap, as a paint bucket should', () => {
  const image = blank();
  box(image);
  for (let w = 0; w < 3; w++) for (let y = 28; y < 32; y++) set(image, 10 + w, y, 255);
  floodFill(image, 30, 30, RED);
  assert.deepEqual(pixel(image, 2, 2), RED);
});

test('no pale halo is left along a soft edge', () => {
  const image = blank();
  box(image, true);
  floodFill(image, 30, 30, RED);
  assert.deepEqual(pixel(image, 13, 30), RED);
});

test('a closed shape counts as enclosed, and its outside and a broken shape do not', () => {
  const image = blank();
  box(image);
  assert.equal(isEnclosed(image, 30, 30), true);
  assert.equal(isEnclosed(image, 2, 2), false);
  for (let w = 0; w < 3; w++) for (let y = 28; y < 32; y++) set(image, 10 + w, y, 255);
  assert.equal(isEnclosed(image, 30, 30), false);
});

test('filling with the same colour changes nothing', () => {
  const image = blank();
  assert.equal(floodFill(image, 5, 5, [255, 255, 255]), false);
});

test('a whole blank canvas fills, corners included', () => {
  const image = blank();
  floodFill(image, 30, 30, RED);
  for (const [x, y] of [[0, 0], [59, 0], [0, 59], [59, 59]]) assert.deepEqual(pixel(image, x, y), RED);
});
