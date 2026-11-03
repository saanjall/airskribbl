import { useState } from 'react';
import { Camera, CameraOff, Eye, EyeOff, LoaderCircle } from 'lucide-react';

const GESTURE_LABEL = {
  none: { text: 'Raise your hand', dot: 'bg-[#8d86ad]' },
  arming: { text: 'Hold it up', dot: 'bg-yellow' },
  hover: { text: 'Ready', dot: 'bg-mint' },
  draw: { text: 'Drawing', dot: 'bg-pink' },
  lifted: { text: 'Curl to draw again', dot: 'bg-yellow' },
  paused: { text: 'Paused', dot: 'bg-yellow' },
};

const TOOL_LABELS = {
  eraser: {
    ...GESTURE_LABEL,
    hover: { text: 'Open hand to erase', dot: 'bg-mint' },
    draw: { text: 'Open hand to erase', dot: 'bg-mint' },
    lifted: { text: 'Open hand to erase', dot: 'bg-mint' },
    paused: { text: 'Erasing', dot: 'bg-pink' },
  },
  fill: {
    ...GESTURE_LABEL,
    hover: { text: 'Point inside a shape', dot: 'bg-mint' },
    draw: { text: 'Hold in a shape to fill', dot: 'bg-pink' },
    lifted: { text: 'Hold in a shape to fill', dot: 'bg-pink' },
  },
};

/** Small corner panel: mirrored preview, tracking status and camera controls. */
export function CameraPanel({ tracker, tool, onEnable }) {
  const { videoRef, overlayRef, markPalm, status, error, gesture, fps } = tracker;
  const [hidden, setHidden] = useState(false);
  const live = status === 'live';
  const busy = status === 'starting' || status === 'loading';
  const label = (TOOL_LABELS[tool] ?? GESTURE_LABEL)[gesture];
  markPalm.current = tool === 'eraser';

  const enable = () => {
    onEnable?.(true);
    tracker.start();
  };

  return (
    <section aria-label="Camera" className="sticker w-40 overflow-hidden !rounded-2xl !shadow-[3px_3px_0_var(--line)] sm:w-52">
      <div className={`relative aspect-[4/3] bg-[#1e1457] ${hidden || !(live || busy) ? 'hidden' : ''}`}>
        <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
        <canvas ref={overlayRef} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
        {busy && (
          <div className="absolute inset-0 grid place-items-center bg-[#1e1457]/80 text-center text-sm font-semibold text-white">
            <span className="flex flex-col items-center gap-1">
              <LoaderCircle className="animate-spin" size={22} aria-hidden="true" />
              {status === 'starting' ? 'Waiting for camera' : 'Loading hand tracking'}
            </span>
          </div>
        )}
      </div>

      {live && (
        <div className="flex flex-wrap items-center justify-end gap-x-1 p-1.5">
          <p role="status" data-hand-status className="flex basis-full items-center gap-1.5 px-1 text-xs font-bold">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${label.dot}`} aria-hidden="true" />
            <span className="flex-1 truncate">{label.text}</span>
            <span className="font-medium whitespace-nowrap text-muted">{fps > 0 ? `${fps} fps` : ''}</span>
          </p>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-card-soft" aria-label={hidden ? 'Show preview' : 'Hide preview'} title={hidden ? 'Show preview' : 'Hide preview'} onClick={() => setHidden((h) => !h)}>
            {hidden ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-card-soft"
            aria-label="Turn off camera"
            title="Turn off camera"
            onClick={() => {
              onEnable?.(false);
              tracker.stop();
            }}
          >
            <CameraOff size={16} />
          </button>
        </div>
      )}

      {!live && !busy && (
        <div className="p-2.5 text-sm">
          {error && <p role="alert" className="mb-2 font-semibold">{error}</p>}
          <button type="button" className="btn btn-mint w-full !min-h-10 !px-1 !py-1 text-sm whitespace-nowrap" onClick={enable}>
            <Camera size={17} aria-hidden="true" /> {error ? 'Try camera again' : 'Turn on camera'}
          </button>
          <p className="mt-2 text-xs text-muted max-sm:hidden">
            {error ? 'You can keep drawing with your mouse.' : 'Video stays on your device. Mouse drawing also works.'}
          </p>
        </div>
      )}
    </section>
  );
}
