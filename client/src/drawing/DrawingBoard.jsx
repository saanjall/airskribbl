import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { BRUSH_MAX, BRUSH_MIN, CANVAS_W, ERASER_MAX, SHAPES } from '../../../shared/constants.js';
import { PenSmoother } from '../tracking/gestures.js';
import { StrokeCanvas } from './StrokeCanvas.js';

const MIN_STEP = 0.0012;
// A shape smaller than this is a stray click, not a shape.
const MIN_SHAPE = 0.012;
const round = (v) => Math.round(v * 10000) / 10000;
// Canvas widths per second. A wipe starts on a real swipe, not on a raised still hand.
const WIPE_START_SPEED = 0.18;
// A pointing finger fills after resting this long within this radius (canvas widths).
const FILL_HOLD_MS = 400;
const FILL_RADIUS = 0.025;
// The pencil is thin, so the mouse eraser is a few times wider than it.
const MOUSE_ERASER_SCALE = 3;
const shapeOf = ({ id, shape, color, size, startX, startY, x, y }) => ({
  id, shape, color, size,
  tool: 'pen',
  pts: [startX, startY, x, y].map(round),
});
const wipeWidth = (palm) => Math.min(ERASER_MAX, Math.max(BRUSH_MAX, palm.width * CANVAS_W));

/**
 * The shared drawing surface. Mouse, touch and hand input all funnel into
 * penDown/penMove/penUp, which paint locally and report ops through `onOp`.
 * Viewers just feed ops in through the ref's `apply`.
 */
export const DrawingBoard = forwardRef(function DrawingBoard({ canDraw = false, brush, onOp, onShapePlaced, label }, ref) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const cursorRef = useRef(null);
  const engineRef = useRef(null);
  const penRef = useRef(null);
  const smootherRef = useRef(null);
  const fillSpotRef = useRef(null);
  smootherRef.current ??= new PenSmoother();
  const live = useRef({});
  live.current = { canDraw, brush, onOp, onShapePlaced };

  useEffect(() => {
    engineRef.current = new StrokeCanvas(canvasRef.current, overlayRef.current);
  }, []);

  const commit = useCallback((op) => {
    engineRef.current.apply(op);
    live.current.onOp?.(op);
  }, []);

  const fillAt = useCallback((x, y) => {
    if (!live.current.canDraw) return;
    const id = (engineRef.current.strokes.at(-1)?.id ?? 0) + 1;
    const { color } = live.current.brush;
    commit({ op: 'fill', stroke: { id, color, tool: 'fill', size: BRUSH_MIN, pts: [round(x), round(y)] } });
  }, [commit]);

  const penDown = useCallback((x, y, width) => {
    if (!live.current.canDraw || penRef.current) return;
    const { color, tool, size: brushSize } = live.current.brush;
    if (tool === 'fill') {
      fillAt(x, y);
      return;
    }
    const size = width ?? (tool === 'eraser' ? brushSize * MOUSE_ERASER_SCALE : brushSize);
    const id = (engineRef.current.strokes.at(-1)?.id ?? 0) + 1;
    if (SHAPES.includes(tool)) {
      penRef.current = { id, shape: tool, color, size, startX: x, startY: y, x, y };
      return;
    }
    penRef.current = { id, x, y };
    commit({ op: 'begin', stroke: { id, color, size, tool, x: round(x), y: round(y) } });
  }, [commit, fillAt]);

  const penMove = useCallback((x, y) => {
    const pen = penRef.current;
    if (!pen || Math.hypot(x - pen.x, y - pen.y) < MIN_STEP) return;
    pen.x = x;
    pen.y = y;
    if (pen.shape) {
      engineRef.current.preview(shapeOf(pen));
      return;
    }
    commit({ op: 'points', id: pen.id, pts: [round(x), round(y)] });
  }, [commit]);

  const penUp = useCallback(() => {
    const pen = penRef.current;
    if (!pen) return;
    penRef.current = null;
    if (pen.shape) {
      engineRef.current.preview(null);
      const big = Math.hypot(pen.x - pen.startX, pen.y - pen.startY) >= MIN_SHAPE;
      if (big && live.current.canDraw) {
        commit({ op: 'shape', stroke: shapeOf(pen) });
        live.current.onShapePlaced?.();
      }
      return;
    }
    commit({ op: 'end', id: pen.id });
  }, [commit]);

  useEffect(() => {
    if (!canDraw) penUp();
  }, [canDraw, penUp]);

  /** Draws what the smoother releases; the pen only touches down once the finger moves. */
  const drawPoints = useCallback((points) => {
    for (const point of points) {
      if (!penRef.current) {
        penDown(smootherRef.current.origin.x, smootherRef.current.origin.y);
        if (penRef.current) penRef.current.hand = true;
      }
      penMove(point.x, point.y);
    }
  }, [penDown, penMove]);

  const handFrame = useCallback(({ state, x, y, palm, t }) => {
    const erasing = live.current.brush.tool === 'eraser';
    const ready = state === 'hover' || state === 'draw' || state === 'lifted' || state === 'paused';
    const cursor = cursorRef.current;
    if (cursor) {
      cursor.hidden = !ready;
      if (ready) {
        cursor.dataset.state = erasing ? 'wipe' : state;
        cursor.style.left = `${(erasing ? palm.x : x) * 100}%`;
        cursor.style.top = `${(erasing ? palm.y : y) * 100}%`;
        // The ring's share of the board matches the wipe's share of the canvas.
        cursor.style.setProperty('--wipe', `${(wipeWidth(palm) / CANVAS_W) * 100}cqw`);
      }
    }

    if (penRef.current && !penRef.current.hand) return; // the mouse has the pen

    if (live.current.brush.tool === 'fill') {
      // Resting a pointing finger inside a closed shape fills it. Open areas are left
      // alone, since a pause there would otherwise flood the whole picture.
      smootherRef.current.stop();
      penUp();
      const spot = fillSpotRef.current;
      if (state !== 'draw' && state !== 'lifted') fillSpotRef.current = null;
      else if (!spot || Math.hypot(x - spot.x, y - spot.y) > FILL_RADIUS) fillSpotRef.current = { x, y, t };
      else if (!spot.tried && t - spot.t >= FILL_HOLD_MS) {
        spot.tried = true;
        if (engineRef.current.canFillEnclosed(x, y, live.current.brush.color)) fillAt(x, y);
      }
    } else if (erasing) {
      smootherRef.current.stop();
      const wiping = state === 'paused' && (penRef.current || palm.speed >= WIPE_START_SPEED);
      if (!wiping) penUp();
      else if (penRef.current) penMove(palm.x, palm.y);
      else {
        penDown(palm.x, palm.y, wipeWidth(palm));
        if (penRef.current) penRef.current.hand = true;
      }
    } else if (state === 'draw') {
      if (!smootherRef.current.active) smootherRef.current.start(x, y, t);
      else drawPoints(smootherRef.current.push(x, y, t));
    } else {
      // A deliberate stop keeps everything; any other lift drops the held-back tail.
      if (state === 'lifted' && smootherRef.current.active) drawPoints(smootherRef.current.flush());
      smootherRef.current.stop();
      penUp();
    }
  }, [drawPoints, fillAt, penDown, penMove, penUp]);

  useImperativeHandle(ref, () => ({
    handFrame,
    apply: (op) => engineRef.current.apply(op),
    load: (strokes) => engineRef.current.load(strokes),
    reset: () => {
      penRef.current = null;
      smootherRef.current.stop();
      engineRef.current.preview(null);
      engineRef.current.clear();
    },
    undo: () => {
      penUp();
      if (engineRef.current.strokes.length) commit({ op: 'undo' });
    },
    clear: () => {
      penUp();
      commit({ op: 'clear' });
    },
    toBlob: () => engineRef.current.toBlob(),
    strokeCount: () => engineRef.current.strokes.length,
  }), [commit, handFrame, penUp]);

  const toUnit = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    ];
  };

  return (
    <div className="@container relative h-full w-full overflow-hidden rounded-[19px] select-none">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className={`block h-full w-full bg-white ${canDraw ? 'cursor-crosshair touch-none' : ''}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          penDown(...toUnit(e));
        }}
        onPointerMove={(e) => {
          if (penRef.current) penMove(...toUnit(e));
        }}
        onPointerUp={penUp}
        onPointerCancel={penUp}
      />
      <canvas ref={overlayRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      <div ref={cursorRef} className="air-cursor" hidden />
    </div>
  );
});
