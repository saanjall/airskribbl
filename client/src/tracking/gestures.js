// Pure gesture logic: no DOM, no MediaPipe import, so it can be unit tested.
// Finger geometry uses MediaPipe's world landmarks (metres, hand-centred), which keeps
// the ratios below stable as the hand moves nearer to or further from the camera.

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;
const PALM_POINTS = [WRIST, INDEX_MCP, MIDDLE_MCP, PINKY_MCP];
const INDEX_CHAIN = [5, 6, 7, 8];
const OTHER_CHAINS = [
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

const ARM_MS = 700;
const DISARM_MS = 1200;
const POINT_ENTER_MS = 60;
const POINT_EXIT_MS = 90;
const PALM_ENTER_MS = 150;
const PALM_EXIT_MS = 120;

const FINGER_STRAIGHT = 0.85;
const THUMB_SPREAD = 0.45;
const PALM_FACING = 0.35;
// Two limits each way, so a finger hovering near one value can't flicker the pen.
const POINT_INDEX_ENTER = 0.88;
const POINT_INDEX_EXIT = 0.75;
const POINT_OTHERS_ENTER = 0.75;
const POINT_OTHERS_EXIT = 0.85;
// Eraser width as a share of the hand's on-screen palm length.
const WIPE_WIDTH = 0.8;
// The whole canvas fits in the middle of the frame for wiping: the palm sits well
// below the fingertips, so reaching the canvas top must not push the fingers off-camera.
const WIPE_MARGIN = 0.26;
// A finger whose averaged position stays inside this radius (canvas widths) for
// STILL_MS has stopped. Averaging over STILL_AVERAGE_MS keeps tremor and tracking
// noise from restarting the clock.
const STILL_RADIUS = 0.02;
const STILL_MS = 600;
const STILL_AVERAGE_MS = 200;
// The pen trails the finger on a string this long, which absorbs hand tremor.
const STRING_LENGTH = 0.011;
// Curling a finger drags the tip away before the curl registers, so the newest
// points wait this long and are thrown away if the pen lifts.
const TAIL_MS = 100;
// Each drawn point is averaged with this many neighbours on either side.
const SMOOTH_REACH = 3;
// Straightening a finger sweeps the tip, so the start of a line is skipped for this long.
const HEAD_MS = 90;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

/** 1 for a perfectly straight finger, lower as it curls: chord length / bone length. */
export function fingerStraightness(world, [mcp, pip, dip, tip]) {
  const bones = dist(world[mcp], world[pip]) + dist(world[pip], world[dip]) + dist(world[dip], world[tip]);
  return bones > 0 ? dist(world[mcp], world[tip]) / bones : 0;
}

/**
 * How squarely the palm faces the camera: the projected wrist/index/pinky triangle
 * relative to palm length. Measured on image landmarks because the model's depth
 * estimate can collapse: on a flat left hand the world palm came out edge-on while
 * its mirror image read correctly. The 2D figure stayed ~0.65 for both.
 */
export function palmFacing(landmarks, aspect = 4 / 3) {
  const o = landmarks[WRIST];
  const rel = (p) => [(p.x - o.x) * aspect, p.y - o.y];
  const [ux, uy] = rel(landmarks[INDEX_MCP]);
  const [vx, vy] = rel(landmarks[PINKY_MCP]);
  const [px, py] = rel(landmarks[MIDDLE_MCP]);
  const palmSq = px * px + py * py;
  return palmSq > 0 ? Math.abs(ux * vy - uy * vx) / palmSq : 0;
}

/** All four fingers straight, thumb spread away, palm towards the camera. */
export function isOpenPalm(world, landmarks, aspect) {
  const palm = dist(world[WRIST], world[MIDDLE_MCP]);
  if (!(palm > 0)) return false;
  return (
    [INDEX_CHAIN, ...OTHER_CHAINS].every((chain) => fingerStraightness(world, chain) >= FINGER_STRAIGHT) &&
    dist(world[THUMB_TIP], world[INDEX_MCP]) / palm >= THUMB_SPREAD &&
    palmFacing(landmarks, aspect) >= PALM_FACING
  );
}

/** Straightness of the index finger and of the straightest other finger. */
export function pointingScores(world) {
  return {
    index: fingerStraightness(world, INDEX_CHAIN),
    others: Math.max(...OTHER_CHAINS.map((chain) => fingerStraightness(world, chain))),
  };
}

/**
 * The part of the camera frame that maps onto the canvas, as fractions of the frame.
 * It is an inner box because the tracker loses hands at the image edge, so the
 * canvas edges must be reachable without going there.
 */
export function canvasBox(videoAspect, canvasAspect, margin = 0.14) {
  const usable = 1 - margin * 2;
  const w = (usable * canvasAspect) / videoAspect;
  return w > usable
    ? { w: usable, h: (usable * videoAspect) / canvasAspect }
    : { w, h: usable };
}

/** Maps a raw landmark position to 0..1 canvas space, mirrored to match the view. */
export function mapToCanvas(nx, ny, videoAspect, canvasAspect, margin) {
  const { w, h } = canvasBox(videoAspect, canvasAspect, margin);
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const x = (1 - nx - (0.5 - w / 2)) / w;
  const y = (ny - (0.5 - h / 2)) / h;
  return {
    x: clamp(x),
    y: clamp(y),
    inside: x >= 0 && x <= 1 && y >= 0 && y <= 1,
    scale: w,
  };
}

/** One Euro filter: heavy smoothing when the finger is slow, little lag when it is fast. */
export class OneEuroFilter {
  constructor({ minCutoff = 1.5, beta = 6, dCutoff = 1 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value, tMs) {
    if (this.x === null) {
      this.x = value;
      this.t = tMs;
      return value;
    }
    const dt = Math.max((tMs - this.t) / 1000, 1e-3);
    this.t = tMs;
    const rawDx = (value - this.x) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    this.dx += aD * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = OneEuroFilter.alpha(cutoff, dt);
    this.x += a * (value - this.x);
    return this.x;
  }
}

/**
 * Turns the fingertip path into the line that gets drawn. The pen is pulled along
 * on a short string, so it ignores jitter and rounds off wobbles, and it holds
 * back the newest points so a lift can discard them. Holding them back also means
 * each point can be averaged with the ones after it at no extra delay.
 */
export class PenSmoother {
  constructor() {
    this.stop();
  }

  start(x, y, t) {
    this.active = true;
    this.startedAt = t;
    this.origin = { x, y };
    this.pen = { x, y };
    this.queue = [];
    this.recent = [{ x, y }];
  }

  release(count) {
    const out = [];
    for (let n = 0; n < count; n++) {
      const point = this.queue.shift();
      const around = [...this.recent, point, ...this.queue.slice(0, SMOOTH_REACH)];
      out.push({
        x: around.reduce((sum, p) => sum + p.x, 0) / around.length,
        y: around.reduce((sum, p) => sum + p.y, 0) / around.length,
      });
      this.recent = [...this.recent, point].slice(-SMOOTH_REACH);
    }
    return out;
  }

  /** Feeds a fingertip position and returns the points now safe to draw. */
  push(x, y, t) {
    if (t - this.startedAt < HEAD_MS) {
      this.origin = { x, y };
      this.pen = { x, y };
      this.recent = [{ x, y }];
      return [];
    }
    const dx = x - this.pen.x;
    const dy = y - this.pen.y;
    const gap = Math.hypot(dx, dy);
    if (gap > STRING_LENGTH) {
      const pull = (gap - STRING_LENGTH) / gap;
      this.pen = { x: this.pen.x + dx * pull, y: this.pen.y + dy * pull };
      this.queue.push({ ...this.pen, t });
    }
    return this.release(this.queue.filter((p) => t - p.t >= TAIL_MS).length);
  }

  /** Everything still held back, for when the pen stops deliberately. */
  flush() {
    return this.release(this.queue.length);
  }

  stop() {
    this.active = false;
    this.origin = null;
    this.pen = null;
    this.queue = [];
    this.recent = [];
  }
}

const NO_HAND = { state: 'none', x: null, y: null, palm: null };

/**
 * Turns per-frame landmarks into a stable state:
 * 'none'    no hand in view
 * 'arming'  hand raised, not ready yet: it must stay up for ARM_MS
 * 'hover'   ready, pen up
 * 'draw'    ready, index finger pointing
 * 'lifted'  still pointing, but the finger stopped, which ends the line.
 *           It stays lifted until the finger is curled and pointed again.
 * 'paused'  ready, open palm (the wipe pose when the eraser is selected)
 *
 * A hand that drops out stops the stroke at once, but stays ready for DISARM_MS
 * so a brief tracking dropout doesn't mean raising it all over again.
 */
export class GestureMachine {
  constructor({ videoAspect = 4 / 3, canvasAspect = 4 / 3 } = {}) {
    this.videoAspect = videoAspect;
    this.canvasAspect = canvasAspect;
    this.fx = new OneEuroFilter({ minCutoff: 1, beta: 5 });
    this.fy = new OneEuroFilter({ minCutoff: 1, beta: 5 });
    this.palmX = new OneEuroFilter();
    this.palmY = new OneEuroFilter();
    this.reset();
  }

  reset() {
    this.armed = false;
    this.heldSince = null;
    this.lostSince = null;
    this.resetPose();
  }

  resetPose() {
    for (const f of [this.fx, this.fy, this.palmX, this.palmY]) f.reset();
    this.pointing = false;
    this.paused = false;
    this.pointSince = null;
    this.palmSince = null;
    this.lastPalm = null;
    this.anchor = null;
    this.averaged = null;
    this.lifted = false;
  }

  /** Each `*Since` field times how long the raw signal has disagreed with the settled state. */
  updatePointing(world, t) {
    const { index, others } = pointingScores(world);
    const wantsChange = this.pointing
      ? index < POINT_INDEX_EXIT || others > POINT_OTHERS_EXIT
      : index >= POINT_INDEX_ENTER && others < POINT_OTHERS_ENTER;
    if (!wantsChange) {
      this.pointSince = null;
      return;
    }
    this.pointSince ??= t;
    if (t - this.pointSince >= (this.pointing ? POINT_EXIT_MS : POINT_ENTER_MS)) {
      this.pointing = !this.pointing;
      this.pointSince = null;
    }
  }

  updatePalm(open, t) {
    if (open === this.paused) {
      this.palmSince = null;
      return;
    }
    this.palmSince ??= t;
    if (t - this.palmSince >= (this.paused ? PALM_EXIT_MS : PALM_ENTER_MS)) {
      this.paused = open;
      this.palmSince = null;
    }
  }

  /** Stillness only counts once the finger has moved, so aiming before a line is safe. */
  updateStillness(x, y, t) {
    if (!this.pointing || !this.armed || this.paused) {
      this.anchor = null;
      this.averaged = null;
      this.lifted = false;
      return;
    }
    if (this.lifted) return;

    const last = this.averaged ?? { x, y, t };
    const blend = 1 - Math.exp(-(t - last.t) / STILL_AVERAGE_MS);
    const avg = { x: last.x + (x - last.x) * blend, y: last.y + (y - last.y) * blend, t };
    this.averaged = avg;

    if (!this.anchor) this.anchor = { ...avg, moved: false };
    else if (Math.hypot(avg.x - this.anchor.x, avg.y - this.anchor.y) > STILL_RADIUS) this.anchor = { ...avg, moved: true };
    else if (this.anchor.moved && t - this.anchor.t >= STILL_MS) this.lifted = true;
  }

  /** Palm centre in canvas space, with its speed (canvas widths per second) and wipe width. */
  trackPalm(landmarks, t) {
    const anchors = PALM_POINTS.map((i) => landmarks[i]);
    const cx = anchors.reduce((sum, p) => sum + p.x, 0) / anchors.length;
    const cy = anchors.reduce((sum, p) => sum + p.y, 0) / anchors.length;
    const mapped = mapToCanvas(cx, cy, this.videoAspect, this.canvasAspect, WIPE_MARGIN);
    const x = this.palmX.filter(mapped.x, t);
    const y = this.palmY.filter(mapped.y, t);

    const last = this.lastPalm;
    const dt = last ? Math.max((t - last.t) / 1000, 1e-3) : 1;
    const speed = last ? Math.hypot(x - last.x, y - last.y) / dt : 0;
    this.lastPalm = { x, y, t };

    const wrist = landmarks[WRIST];
    const knuckle = landmarks[MIDDLE_MCP];
    const palmLength = Math.hypot((knuckle.x - wrist.x) * this.videoAspect, knuckle.y - wrist.y);
    const { w: frameWidth } = canvasBox(this.videoAspect, this.canvasAspect);
    const width = (palmLength * WIPE_WIDTH) / (frameWidth * this.videoAspect);
    return { x, y, speed, width };
  }

  /** @param frame {{landmarks?, world?, t}} landmarks are absent when no hand was found. */
  update({ landmarks, world, t }) {
    if (!landmarks) {
      this.resetPose();
      this.heldSince = null;
      this.lostSince ??= t;
      if (t - this.lostSince >= DISARM_MS) this.armed = false;
      return NO_HAND;
    }

    this.lostSince = null;
    this.heldSince ??= t;
    if (!this.armed && t - this.heldSince >= ARM_MS) this.armed = true;

    const tip = landmarks[INDEX_TIP];
    const mapped = mapToCanvas(tip.x, tip.y, this.videoAspect, this.canvasAspect);
    const x = this.fx.filter(mapped.x, t);
    const y = this.fy.filter(mapped.y, t);
    const palm = this.trackPalm(landmarks, t);
    this.updatePointing(world, t);
    this.updatePalm(isOpenPalm(world, landmarks, this.videoAspect), t);
    this.updateStillness(x, y, t);

    let state = 'hover';
    if (!this.armed) state = 'arming';
    else if (this.paused) state = 'paused';
    else if (this.pointing && this.lifted) state = 'lifted';
    else if (this.pointing && mapped.inside) state = 'draw';
    return { state, x, y, palm, t };
  }
}
