import { CANVAS_H, CANVAS_W, ERASER_COLOR } from '../../../shared/constants.js';
import { floodFill, isEnclosed } from './floodFill.js';

// Pencil feel: the line thins at both ends, and a slower hand presses harder.
const TAPER_POINTS = 6;
const TAPER_MIN = 0.3;
const FAST_SEGMENT = 34;
const PRESSURE_EASE = 0.2;
const GRAIN_SIZE = 96;
const GRAIN_MIN_ALPHA = 0.6;

const isPencil = (stroke) => stroke.tool === 'pen' && !stroke.shape;
const taper = (steps) => Math.min(1, TAPER_MIN + ((1 - TAPER_MIN) * steps) / TAPER_POINTS);

/** The same grain everywhere: seeded, so every player renders identical pixels. */
function grainTile(color) {
  const tile = document.createElement('canvas');
  tile.width = GRAIN_SIZE;
  tile.height = GRAIN_SIZE;
  const ctx = tile.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, GRAIN_SIZE, GRAIN_SIZE);
  const image = ctx.getImageData(0, 0, GRAIN_SIZE, GRAIN_SIZE);
  let seed = 1234567;
  for (let i = 3; i < image.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    // Never fully clear: a fill must not be able to leak through the grain.
    image.data[i] = 255 * (GRAIN_MIN_ALPHA + (1 - GRAIN_MIN_ALPHA) * (seed / 4294967296));
  }
  ctx.putImageData(image, 0, 0);
  return tile;
}

/**
 * Stroke model and renderer. A stroke is {id, color, size, tool, pts: [x, y, ...]}
 * with coordinates as 0..1 fractions. All paint is opaque, so a stroke can be
 * painted incrementally onto one canvas and only undo needs a full redraw.
 * A shape is a stroke with a `shape` name and two points: opposite corners, or for
 * a circle the centre and a point on the rim, so the rim stays under the finger.
 * A fill is a stroke with tool 'fill' and one point, replayed against what is under it.
 * Shapes being dragged out appear on `overlay`, so the drawing is left untouched.
 */
export class StrokeCanvas {
  constructor(canvas, overlay) {
    for (const layer of [canvas, overlay]) {
      layer.width = CANVAS_W;
      layer.height = CANVAS_H;
    }
    this.canvas = canvas;
    // Fills read pixels back, and every client must render the same pixels to fill alike.
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.overlayCtx = overlay.getContext('2d');
    this.strokes = [];
    this.byId = new Map();
    this.grains = new Map();
    this.redraw();
  }

  grain(color) {
    if (!this.grains.has(color)) this.grains.set(color, this.ctx.createPattern(grainTile(color), 'repeat'));
    return this.grains.get(color);
  }

  style(stroke, ctx = this.ctx) {
    const paint = stroke.tool === 'eraser' ? ERASER_COLOR : this.grain(stroke.color);
    ctx.strokeStyle = paint;
    ctx.fillStyle = paint;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  point(stroke, i) {
    return [stroke.pts[i * 2] * CANVAS_W, stroke.pts[i * 2 + 1] * CANVAS_H];
  }

  dot(stroke) {
    const [x, y] = this.point(stroke, 0);
    const radius = (stroke.size / 2) * (isPencil(stroke) ? TAPER_MIN : 1);
    this.style(stroke);
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /** Paints the curve up to point i: a quadratic through the midpoints either side of i-1. */
  segment(stroke, i) {
    const { ctx } = this;
    const [cx, cy] = this.point(stroke, i - 1);
    const [nx, ny] = this.point(stroke, i);
    const [px, py] = i > 1 ? this.point(stroke, i - 2) : [cx, cy];
    ctx.beginPath();
    ctx.moveTo((px + cx) / 2, (py + cy) / 2);
    ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
    ctx.stroke();
  }

  /**
   * Paints up to segment `last`, tracking pen pressure along the way. Live strokes stop
   * TAPER_POINTS short, because how a segment thins depends on where the line ends.
   */
  advance(stroke, last, final) {
    const n = stroke.pts.length / 2;
    this.style(stroke);
    for (let i = stroke.painted; i <= last; i++) {
      if (isPencil(stroke)) {
        const [ax, ay] = this.point(stroke, i - 1);
        const [bx, by] = this.point(stroke, i);
        const pressure = 1 - Math.min(1, Math.hypot(bx - ax, by - ay) / FAST_SEGMENT);
        stroke.pressure += (pressure - stroke.pressure) * PRESSURE_EASE;
        const ends = Math.min(taper(i), final ? taper(n - 1 - i) : 1);
        this.ctx.lineWidth = stroke.size * (0.75 + 0.5 * stroke.pressure) * ends;
      }
      this.segment(stroke, i);
    }
    stroke.painted = Math.max(stroke.painted, last + 1);
  }

  /** Closes the half-segment between the final midpoint and the final point. */
  tail(stroke) {
    const n = stroke.pts.length / 2;
    if (n < 2) return;
    const [ax, ay] = this.point(stroke, n - 2);
    const [bx, by] = this.point(stroke, n - 1);
    this.style(stroke);
    if (isPencil(stroke)) this.ctx.lineWidth = stroke.size * TAPER_MIN;
    this.ctx.beginPath();
    this.ctx.moveTo((ax + bx) / 2, (ay + by) / 2);
    this.ctx.lineTo(bx, by);
    this.ctx.stroke();
  }

  paintShape(stroke, ctx = this.ctx) {
    const [x0, y0] = this.point(stroke, 0);
    const [x1, y1] = this.point(stroke, 1);
    this.style(stroke, ctx);
    ctx.beginPath();
    if (stroke.shape === 'line') {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    } else if (stroke.shape === 'rect') {
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
    } else if (stroke.shape === 'circle') {
      ctx.arc(x0, y0, Math.hypot(x1 - x0, y1 - y0), 0, Math.PI * 2);
    } else {
      ctx.moveTo((x0 + x1) / 2, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x0, y1);
      ctx.closePath();
    }
    ctx.stroke();
  }

  pixelAt(x, y) {
    return [Math.min(CANVAS_W - 1, Math.floor(x * CANVAS_W)), Math.min(CANVAS_H - 1, Math.floor(y * CANVAS_H))];
  }

  /** Whether a hand fill here would stay inside a shape and change something. */
  canFillEnclosed(x, y, color) {
    const [px, py] = this.pixelAt(x, y);
    const image = this.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    const i = (py * CANVAS_W + px) * 4;
    const hex = parseInt(color.slice(1), 16);
    const same = image.data[i] === hex >> 16 && image.data[i + 1] === ((hex >> 8) & 255) && image.data[i + 2] === (hex & 255);
    return !same && isEnclosed(image, px, py);
  }

  paintFill(stroke) {
    const [x, y] = this.pixelAt(stroke.pts[0], stroke.pts[1]);
    const hex = parseInt(stroke.color.slice(1), 16);
    const image = this.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    if (floodFill(image, x, y, [hex >> 16, (hex >> 8) & 255, hex & 255])) this.ctx.putImageData(image, 0, 0);
  }

  paint(stroke) {
    if (stroke.tool === 'fill') {
      this.paintFill(stroke);
      return;
    }
    if (stroke.shape) {
      this.paintShape(stroke);
      return;
    }
    stroke.painted = 1;
    stroke.pressure = 0.5;
    this.dot(stroke);
    this.advance(stroke, stroke.pts.length / 2 - 1, true);
    this.tail(stroke);
  }

  begin({ id, color, size, tool, x, y }) {
    const stroke = { id, color, size, tool, pts: [x, y], painted: 1, pressure: 0.5 };
    this.strokes.push(stroke);
    this.byId.set(id, stroke);
    this.dot(stroke);
  }

  extend(id, pts) {
    const stroke = this.byId.get(id);
    if (!stroke) return;
    stroke.pts.push(...pts);
    this.advance(stroke, stroke.pts.length / 2 - 1 - (isPencil(stroke) ? TAPER_POINTS : 0), false);
  }

  end(id) {
    const stroke = this.byId.get(id);
    if (!stroke) return;
    this.advance(stroke, stroke.pts.length / 2 - 1, true);
    this.tail(stroke);
  }

  /** Adds a finished shape or fill. */
  add(finished) {
    const stroke = { ...finished, pts: [...finished.pts] };
    this.strokes.push(stroke);
    this.byId.set(stroke.id, stroke);
    this.paint(stroke);
  }

  /** Shows a shape in progress, or clears it when given nothing. */
  preview(shape) {
    this.overlayCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (shape) this.paintShape(shape, this.overlayCtx);
  }

  undo() {
    const stroke = this.strokes.pop();
    if (!stroke) return;
    this.byId.delete(stroke.id);
    this.redraw();
  }

  clear() {
    this.load([]);
  }

  load(strokes) {
    this.strokes = strokes.map((s) => ({ ...s, pts: [...s.pts] }));
    this.byId = new Map(this.strokes.map((s) => [s.id, s]));
    this.redraw();
  }

  redraw() {
    this.ctx.fillStyle = ERASER_COLOR;
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    for (const stroke of this.strokes) this.paint(stroke);
  }

  apply(op) {
    if (op.op === 'begin') this.begin(op.stroke);
    else if (op.op === 'points') this.extend(op.id, op.pts);
    else if (op.op === 'end') this.end(op.id);
    else if (op.op === 'shape' || op.op === 'fill') this.add(op.stroke);
    else if (op.op === 'undo') this.undo();
    else if (op.op === 'clear') this.clear();
  }

  toBlob() {
    return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'));
  }
}
