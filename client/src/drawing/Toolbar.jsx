import { useState } from 'react';
import { Brush, Circle, Eraser, PaintBucket, Slash, Square, Trash2, Triangle, Undo2 } from 'lucide-react';
import { BRUSH_COLORS, BRUSH_MAX, BRUSH_MIN } from '../../../shared/constants.js';
import { getPref, setPref } from '../lib/prefs.js';

const COLOR_NAMES = [
  'Black', 'Grey', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Pink', 'Brown', 'Peach',
];

const SHAPE_BUTTONS = [
  { tool: 'line', label: 'Line', icon: Slash },
  { tool: 'rect', label: 'Rectangle', icon: Square },
  { tool: 'circle', label: 'Circle', icon: Circle },
  { tool: 'triangle', label: 'Triangle', icon: Triangle },
];

export function useBrush() {
  const [brush, setBrush] = useState(() => ({
    tool: 'pen',
    color: getPref('brushColor', BRUSH_COLORS[7]),
    size: getPref('pencilSize', 6),
  }));
  const update = (patch) => {
    setBrush((b) => ({ ...b, ...patch }));
    if (patch.color) setPref('brushColor', patch.color);
    if (patch.size) setPref('pencilSize', patch.size);
  };
  return [brush, update];
}

export function Toolbar({ brush, setBrush, onUndo, onClear, disabled = false }) {
  return (
    <div role="toolbar" aria-label="Drawing tools" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="grid grid-cols-6 gap-1" role="group" aria-label="Brush colour">
        {BRUSH_COLORS.map((color, i) => {
          const active = brush.color === color && brush.tool !== 'eraser';
          return (
            <button
              key={color}
              type="button"
              disabled={disabled}
              aria-label={COLOR_NAMES[i]}
              aria-pressed={active}
              onClick={() => setBrush({ color, tool: brush.tool === 'eraser' ? 'pen' : brush.tool })}
              className={`h-6 w-6 rounded-lg border-2 border-line transition-transform hover:scale-110 disabled:opacity-50 ${active ? 'scale-115 ring-2 ring-pink ring-offset-1' : ''}`}
              style={{ backgroundColor: color }}
            />
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <span className="sr-only">Brush thickness</span>
        <span
          aria-hidden="true"
          className="grid h-10 w-8 place-items-center"
        >
          <span
            className="block rounded-full"
            style={{
              width: Math.max(3, brush.size * 0.8),
              height: Math.max(3, brush.size * 0.8),
              backgroundColor: brush.tool === 'eraser' ? 'var(--lavender)' : brush.color,
            }}
          />
        </span>
        <input
          type="range"
          min={BRUSH_MIN}
          max={BRUSH_MAX}
          step={2}
          value={brush.size}
          disabled={disabled}
          onChange={(e) => setBrush({ size: Number(e.target.value) })}
          className="w-16 accent-pink"
        />
      </label>

      <div className="flex gap-1" role="group" aria-label="Shapes">
        {SHAPE_BUTTONS.map(({ tool, label, icon: Icon }) => (
          <button key={tool} type="button" className="icon-btn !h-10 !w-10" disabled={disabled} aria-label={label} title={label}
            aria-pressed={brush.tool === tool} onClick={() => setBrush({ tool })}>
            <Icon size={19} />
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        <button type="button" className="icon-btn !h-10 !w-10" disabled={disabled} aria-label="Brush" title="Brush"
          aria-pressed={brush.tool === 'pen'} onClick={() => setBrush({ tool: 'pen' })}>
          <Brush size={20} />
        </button>
        <button type="button" className="icon-btn !h-10 !w-10" disabled={disabled} aria-label="Fill" title="Fill"
          aria-pressed={brush.tool === 'fill'} onClick={() => setBrush({ tool: 'fill' })}>
          <PaintBucket size={20} />
        </button>
        <button type="button" className="icon-btn !h-10 !w-10" disabled={disabled} aria-label="Eraser" title="Eraser"
          aria-pressed={brush.tool === 'eraser'} onClick={() => setBrush({ tool: 'eraser' })}>
          <Eraser size={20} />
        </button>
        <button type="button" className="icon-btn !h-10 !w-10" disabled={disabled} aria-label="Undo last stroke" title="Undo last stroke" onClick={onUndo}>
          <Undo2 size={20} />
        </button>
        <button type="button" className="icon-btn !h-10 !w-10" disabled={disabled} aria-label="Clear canvas" title="Clear canvas" onClick={onClear}>
          <Trash2 size={20} />
        </button>
      </div>
    </div>
  );
}
