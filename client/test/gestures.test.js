import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GestureMachine, OneEuroFilter, PenSmoother, canvasBox, isOpenPalm, mapToCanvas, palmFacing, pointingScores,
} from '../src/tracking/gestures.js';

// A synthetic hand in metres, palm to camera, fingers up (y grows downwards).
function hand(pose = 'open') {
  const straight = { open: [5, 9, 13, 17], point: [5], peace: [5, 9], fist: [] }[pose];
  const w = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const set = (i, x, y, z = 0) => { w[i] = { x, y, z }; };
  set(0, 0, 0);
  [[5, -0.03], [9, -0.01], [13, 0.01], [17, 0.03]].forEach(([mcp, x]) => {
    set(mcp, x, -0.09);
    if (straight.includes(mcp)) {
      for (let k = 1; k <= 3; k++) set(mcp + k, x * 1.2, -0.09 - 0.025 * k);
    } else {
      set(mcp + 1, x, -0.11, 0.02);
      set(mcp + 2, x, -0.1, 0.04);
      set(mcp + 3, x, -0.08, 0.03);
    }
  });
  set(1, -0.03, -0.02); set(2, -0.06, -0.04); set(3, -0.08, -0.06);
  set(4, pose === 'open' ? -0.1 : -0.04, pose === 'open' ? -0.08 : -0.05);
  return w;
}

// Projects a synthetic hand into image space at 4:3, optionally shifted sideways.
const image = (world, dx = 0) => world.map((p) => ({ x: 0.5 + dx + (p.x * 2) / (4 / 3), y: 0.7 + p.y * 2, z: 0 }));

const STEP = 33;
const run = (m, frames, start = 0, shift = () => 0) =>
  frames.map((world, i) => m.update({ landmarks: image(world, shift(i)), world, t: start + i * STEP }));

/** A machine that has already been through the raise-your-hand step. */
function armedMachine() {
  const m = new GestureMachine();
  run(m, Array(30).fill(hand('fist')));
  return m;
}

test('a raised hand must stay up before it is ready', () => {
  const m = new GestureMachine();
  const states = run(m, Array(30).fill(hand('fist'))).map((r) => r.state);
  assert.equal(states[0], 'arming');
  assert.equal(states[15], 'arming');
  assert.equal(states.at(-1), 'hover');
});

test('nothing draws while arming, even when pointing', () => {
  const m = new GestureMachine();
  const states = run(m, Array(15).fill(hand('point'))).map((r) => r.state);
  assert.ok(states.every((s) => s === 'arming'));
});

test('pointing draws and curling the finger lifts the pen', () => {
  const m = armedMachine();
  const frames = [...Array(5).fill(hand('point')), ...Array(6).fill(hand('fist'))];
  const states = run(m, frames, 2000).map((r) => r.state);
  assert.equal(states[4], 'draw');
  assert.equal(states.at(-1), 'hover');
});

test('two raised fingers do not draw', () => {
  const m = armedMachine();
  const states = run(m, Array(8).fill(hand('peace')), 2000).map((r) => r.state);
  assert.ok(states.every((s) => s === 'hover'));
});

test('a one-frame curl does not break the stroke', () => {
  const m = armedMachine();
  run(m, Array(5).fill(hand('point')), 2000);
  const [spike, after] = run(m, [hand('fist'), hand('point')], 2500);
  assert.equal(spike.state, 'draw');
  assert.equal(after.state, 'draw');
});

test('losing the hand stops drawing at once but a short dropout stays ready', () => {
  const m = armedMachine();
  run(m, Array(5).fill(hand('point')), 2000);
  assert.equal(m.update({ t: 2300 }).state, 'none');
  assert.equal(m.pointing, false);
  assert.equal(run(m, [hand('fist')], 2600)[0].state, 'hover');
});

test('a hand gone for a while must be raised again', () => {
  const m = armedMachine();
  m.update({ t: 2000 });
  m.update({ t: 3500 });
  assert.equal(run(m, [hand('fist')], 3600)[0].state, 'arming');
});

test('open palm pauses after a short hold, and other poses do not', () => {
  const open = (w) => isOpenPalm(w, image(w));
  assert.equal(open(hand('open')), true);
  assert.equal(open(hand('fist')), false);
  assert.equal(open(hand('point')), false);
  const m = armedMachine();
  const states = run(m, Array(12).fill(hand('open')), 2000).map((r) => r.state);
  assert.equal(states[0], 'hover');
  assert.equal(states.at(-1), 'paused');
});

test('pointing scores separate a pointing hand from an open one', () => {
  const point = pointingScores(hand('point'));
  assert.ok(point.index > 0.88 && point.others < 0.75);
  assert.ok(pointingScores(hand('open')).others > 0.85);
});

test('palm tracking reports speed for a swipe and none for a still hand', () => {
  const m = armedMachine();
  const still = run(m, Array(10).fill(hand('open')), 2000).at(-1);
  assert.ok(still.palm.speed < 0.05);
  const swipe = run(m, Array(10).fill(hand('open')), 2400, (i) => i * 0.02).at(-1);
  assert.ok(swipe.palm.speed > 0.3, `speed ${swipe.palm.speed}`);
  assert.ok(swipe.palm.x < still.palm.x, 'mirrored: the hand moving right in the image goes left on the canvas');
  assert.ok(swipe.palm.width > 0.05 && swipe.palm.width < 0.5);
});

test('wiping reaches the top of the canvas with the fingers still in frame', () => {
  const m = armedMachine();
  const w = hand('open');
  const atTop = image(w).map((p) => ({ ...p, y: p.y - 0.25 }));
  assert.ok(Math.min(...atTop.map((p) => p.y)) > 0, 'fingertips are on camera');
  let frame;
  for (let i = 0; i < 30; i++) frame = m.update({ landmarks: atTop, world: w, t: 2000 + i * STEP });
  assert.ok(frame.palm.y < 0.15, `palm y ${frame.palm.y}`);
});

test('the sweep of a straightening finger is not drawn', () => {
  const s = new PenSmoother();
  s.start(0.5, 0.8, 0);
  assert.deepEqual(s.push(0.5, 0.7, 33), []);
  assert.deepEqual(s.push(0.5, 0.6, 66), []);
  const drawn = [];
  for (let i = 3; i < 12; i++) drawn.push(...s.push(0.5 + i * 0.03, 0.6, i * 33));
  drawn.push(...s.flush());
  assert.ok(drawn.every((p) => p.y < 0.65), 'no point from the sweep');
});

test('a finger leaving the drawing area lifts the pen instead of sliding along the edge', () => {
  const m = armedMachine();
  const outside = (world) => image(world, -0.6);
  const w = hand('point');
  run(m, Array(5).fill(w), 2000);
  let frame;
  for (let i = 0; i < 4; i++) frame = m.update({ landmarks: outside(w), world: w, t: 2300 + i * STEP });
  assert.equal(frame.state, 'hover');
});

test('the camera box matches the canvas shape, so the view lines up without stretching', () => {
  for (const aspect of [4 / 3, 16 / 9]) {
    const { w, h } = canvasBox(aspect, 4 / 3);
    assert.ok(Math.abs((w * aspect) / h - 4 / 3) < 1e-9);
    assert.ok(w <= 0.72 + 1e-9 && h <= 0.72 + 1e-9);
  }
});

test('palm facing treats left and right hands alike and rejects a side-on hand', () => {
  const lm = image(hand('open'));
  const mirrored = lm.map((p) => ({ ...p, x: 1 - p.x }));
  const sideOn = lm.map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) * 0.1 }));
  assert.ok(Math.abs(palmFacing(lm) - palmFacing(mirrored)) < 1e-9);
  assert.ok(palmFacing(lm) >= 0.35);
  assert.ok(palmFacing(sideOn) < 0.35);
});

test('canvas mapping mirrors x and reaches the edges inside the frame', () => {
  const at = (x, y) => mapToCanvas(x, y, 4 / 3, 4 / 3);
  assert.equal(at(0.5, 0.5).x, 0.5);
  assert.equal(at(0.5, 0.5).y, 0.5);
  assert.equal(at(0.86, 0.14).x, 0);
  assert.equal(at(0.14, 0.14).x, 1);
  assert.equal(at(0.5, 0.14).y, 0);
  const wide = mapToCanvas(0.3, 0.3, 16 / 9, 4 / 3);
  assert.ok(wide.x > 0.5 && wide.y < 0.5);
});

test('a finger that stops ends the line until it is curled and pointed again', () => {
  const m = armedMachine();
  const moving = run(m, Array(10).fill(hand('point')), 2000, (i) => i * 0.02);
  assert.equal(moving.at(-1).state, 'draw');
  const still = run(m, Array(40).fill(hand('point')), 2400, () => 0.18).map((r) => r.state);
  assert.equal(still.at(-1), 'lifted');
  const moved = run(m, Array(10).fill(hand('point')), 3800, (i) => 0.18 - i * 0.02);
  assert.ok(moved.every((r) => r.state === 'lifted'), 'moving again does not draw');
  run(m, Array(6).fill(hand('fist')), 4200);
  const again = run(m, Array(5).fill(hand('point')), 4500);
  assert.equal(again.at(-1).state, 'draw');
});

test('a trembling, noisy finger still counts as stopped', () => {
  const m = armedMachine();
  run(m, Array(10).fill(hand('point')), 2000, (i) => i * 0.02);
  const noise = (i) => 0.18 + (((i * 7919) % 13) / 13 - 0.5) * 0.03 + (i % 9 === 0 ? 0.02 : 0);
  const states = run(m, Array(45).fill(hand('point')), 2400, noise).map((r) => r.state);
  assert.equal(states.at(-1), 'lifted');
});

test('slow, steady drawing is not mistaken for stopping', () => {
  const m = armedMachine();
  const states = run(m, Array(90).fill(hand('point')), 2000, (i) => i * 0.0018).map((r) => r.state);
  assert.ok(states.slice(5).every((s) => s === 'draw'));
});

test('aiming with a still finger before drawing does not end anything', () => {
  const m = armedMachine();
  const states = run(m, Array(40).fill(hand('point')), 2000).map((r) => r.state);
  assert.equal(states.at(-1), 'draw');
});

test('pen smoother ignores a trembling finger', () => {
  const s = new PenSmoother();
  s.start(0.5, 0.5, -1000);
  const drawn = [];
  for (let i = 0; i < 90; i++) {
    drawn.push(...s.push(0.5 + Math.sin(i * 2.1) * 0.004, 0.5 + Math.cos(i * 1.7) * 0.004, i * 33));
  }
  assert.equal(drawn.length + s.flush().length, 0);
});

test('pen smoother turns a shaky circle into a smooth one', () => {
  const shake = (i) => (((i * 7919) % 13) / 13 - 0.5) * 0.008;
  const circle = (i, noise) => [
    0.5 + Math.cos(i / 15) * 0.25 + noise,
    0.5 + Math.sin(i / 15) * 0.25 + noise * 0.7,
  ];
  const s = new PenSmoother();
  s.start(...circle(0, 0), -1000);
  const raw = [];
  const drawn = [];
  for (let i = 1; i < 90; i++) {
    const [x, y] = circle(i, shake(i));
    raw.push({ x, y });
    drawn.push(...s.push(x, y, i * 33));
  }
  drawn.push(...s.flush());
  const bend = (path) => {
    let total = 0;
    for (let i = 2; i < path.length; i++) {
      const a = Math.atan2(path[i - 1].y - path[i - 2].y, path[i - 1].x - path[i - 2].x);
      const b = Math.atan2(path[i].y - path[i - 1].y, path[i].x - path[i - 1].x);
      total += Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
    }
    return total;
  };
  assert.ok(bend(drawn) < bend(raw) * 0.6, `bend ${bend(drawn)} vs ${bend(raw)}`);
});

test('pen smoother holds back the tail so a lift can discard it', () => {
  const s = new PenSmoother();
  s.start(0.1, 0.5, -1000);
  const drawn = [];
  for (let i = 1; i <= 10; i++) drawn.push(...s.push(0.1 + i * 0.03, 0.5, i * 33));
  assert.ok(drawn.length < 10);
  assert.ok(drawn.at(-1).x < 0.35, 'the newest movement is not drawn yet');
  const held = s.flush();
  assert.ok(held.length > 0);
  assert.equal(s.flush().length, 0);
});

test('one euro filter damps jitter yet follows real movement', () => {
  const f = new OneEuroFilter();
  let peak = 0;
  for (let i = 0; i < 60; i++) {
    const out = f.filter(0.5 + (i % 2 ? 0.003 : -0.003), i * 33);
    if (i > 10) peak = Math.max(peak, Math.abs(out - 0.5));
  }
  assert.ok(peak < 0.002, `jitter ${peak}`);
  f.reset();
  let out = 0;
  for (let i = 0; i < 12; i++) out = f.filter(i * 0.05, i * 33);
  assert.ok(0.55 - out < 0.1, `lag ${0.55 - out}`);
});
