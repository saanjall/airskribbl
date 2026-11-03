import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CircleHelp, Download, X } from 'lucide-react';
import { DrawingBoard } from '../drawing/DrawingBoard.jsx';
import { Toolbar, useBrush } from '../drawing/Toolbar.jsx';
import { HomeLink } from '../components/Wordmark.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { CameraPanel } from '../tracking/CameraPanel.jsx';
import { useHandTracking } from '../tracking/useHandTracking.js';
import { getPref, setPref } from '../lib/prefs.js';

const READY_STATES = ['hover', 'draw', 'lifted', 'paused'];

const STEPS = [
  { title: 'Turn on your camera', text: 'Use the panel in the corner of the canvas. No camera? Draw with your mouse instead.', done: (t) => t.status === 'live' },
  { title: 'Raise your hand', text: 'Sit about an arm\'s length back and hold your hand up until the camera panel says Ready.', done: (t) => READY_STATES.includes(t.gesture) },
  { title: 'Point to draw', text: 'Point with your index finger and curl the others. The line follows your fingertip.', done: (t) => t.gesture === 'draw' },
  { title: 'Curl your finger to lift the pen', text: 'Close your hand, or hold your finger still for a moment to finish the line. Point again to start a new one.', done: (t) => t.gesture === 'hover' },
  { title: 'Open palm to pause', text: 'Spread all five fingers towards the camera and hold for a moment.', done: (t) => t.gesture === 'paused' },
  { title: 'Wipe to erase', text: 'Pick the eraser, then swipe your open hand across the canvas like wiping a window.', done: (t, tool) => tool === 'eraser' && t.gesture === 'paused' },
];

function Tutorial({ tracker, tool, onClose }) {
  const [step, setStep] = useState(0);
  const finished = step >= STEPS.length;

  useEffect(() => {
    if (!finished && STEPS[step].done(tracker, tool)) setStep((s) => s + 1);
  }, [tracker, tool, step, finished]);

  return (
    <aside aria-label="Tutorial" className="sticker h-fit p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl">{finished ? 'You\'ve got it' : 'Learn the moves'}</h2>
        <button type="button" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-card-soft" aria-label="Close tutorial" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <ol className="mt-3 flex flex-col gap-2.5" aria-live="polite">
        {STEPS.map((s, i) => {
          const state = i < step ? 'done' : i === step ? 'now' : 'next';
          return (
            <li key={s.title} className={`flex gap-2.5 ${state === 'next' ? 'opacity-55' : ''}`}>
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-line text-xs font-bold text-on-accent ${state === 'done' ? 'bg-mint' : state === 'now' ? 'bg-yellow' : 'bg-card text-text'}`}>
                {state === 'done' ? <Check size={14} strokeWidth={3} aria-label="Done" /> : i + 1}
              </span>
              <span className="leading-snug">
                <strong className="block">{s.title}</strong>
                {state === 'now' && <span className="text-sm text-muted">{s.text}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {finished && (
        <button type="button" className="btn btn-mint mt-4 w-full" onClick={onClose}>Keep drawing</button>
      )}
    </aside>
  );
}

export function Practice() {
  const boardRef = useRef(null);
  const [brush, setBrush] = useBrush();
  const [showTutorial, setShowTutorial] = useState(() => !getPref('tutorialDone', false));
  const onFrame = useCallback((frame) => boardRef.current?.handFrame(frame), []);
  const tracker = useHandTracking(onFrame);

  const closeTutorial = () => {
    setPref('tutorialDone', true);
    setShowTutorial(false);
  };

  const save = async () => {
    const blob = await boardRef.current.toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'airskribbl-drawing.png';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <HomeLink />
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-lavender" onClick={save}>
            <Download size={19} aria-hidden="true" /> Save PNG
          </button>
          {!showTutorial && (
            <button type="button" className="icon-btn" aria-label="Show tutorial" title="Show tutorial" onClick={() => setShowTutorial(true)}>
              <CircleHelp size={20} />
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className={`grid flex-1 gap-5 ${showTutorial ? 'lg:grid-cols-[1fr_300px]' : ''}`}>
        <div className="mx-auto flex w-full max-w-[calc((100dvh-11.5rem)*4/3)] min-w-0 flex-col gap-3">
          <div className="sticker relative aspect-[4/3] w-full">
            <DrawingBoard ref={boardRef} canDraw brush={brush} onShapePlaced={() => setBrush({ tool: 'pen' })} label="Your practice drawing" />
            <div className="absolute right-3 bottom-3 z-10">
              <CameraPanel tracker={tracker} tool={brush.tool} />
            </div>
          </div>
          <Toolbar
            brush={brush}
            setBrush={setBrush}
            onUndo={() => boardRef.current.undo()}
            onClear={() => boardRef.current.clear()}
          />
        </div>
        {showTutorial && <Tutorial tracker={tracker} tool={brush.tool} onClose={closeTutorial} />}
      </main>
    </div>
  );
}
