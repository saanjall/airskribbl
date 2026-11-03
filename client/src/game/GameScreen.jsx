import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Timer, WifiOff } from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { HomeLink } from '../components/Wordmark.jsx';
import { DrawingBoard } from '../drawing/DrawingBoard.jsx';
import { Toolbar, useBrush } from '../drawing/Toolbar.jsx';
import { createOpBatcher } from '../drawing/opBatcher.js';
import { smallBurst } from '../lib/confetti.js';
import { getPref, setPref } from '../lib/prefs.js';
import { CameraPanel } from '../tracking/CameraPanel.jsx';
import { useHandTracking } from '../tracking/useHandTracking.js';
import { Chat } from './Chat.jsx';
import { TurnOverlay } from './Overlays.jsx';
import { PlayerList } from './PlayerList.jsx';
import { socket, useRoom } from './RoomContext.jsx';

/** Counts down from the server's figure on each state update; the server still decides when time is up. */
function useCountdown(remainingMs) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (remainingMs === null) {
      setSeconds(0);
      return undefined;
    }
    const deadline = performance.now() + remainingMs;
    const tick = () => setSeconds(Math.max(0, Math.ceil((deadline - performance.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [remainingMs]);
  return seconds;
}

function WordHint({ state, isArtist }) {
  if (state.phase !== 'drawing' && state.phase !== 'reveal') return <p className="font-bold text-muted">Get ready</p>;
  const shown = state.word ?? state.wordMask;
  const letters = [...shown].filter((c) => c !== ' ').length;
  return (
    <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
      {state.word && isArtist && <span className="font-bold text-muted">Draw this:</span>}
      <p
        className="font-display text-2xl tracking-[0.18em] sm:text-3xl"
        aria-label={state.word ? `The word is ${state.word}` : `Hidden word, ${letters} letters`}
      >
        {shown}
      </p>
      {!state.word && <span className="font-bold text-muted">{letters} letters</span>}
    </div>
  );
}

export function GameScreen() {
  const navigate = useNavigate();
  const { state, chat, online, syncKey, send, request, leaveRoom } = useRoom();
  const boardRef = useRef(null);
  const [brush, setBrush] = useBrush();
  const seconds = useCountdown(state.remainingMs);

  const isArtist = state.artistId === state.you;
  const drawing = state.phase === 'drawing';
  const artistTurn = isArtist && (drawing || state.phase === 'choosing');
  const canDraw = isArtist && drawing;
  const artist = state.players.find((p) => p.id === state.artistId);
  const me = state.players.find((p) => p.id === state.you);

  const onFrame = useCallback((frame) => boardRef.current?.handFrame(frame), []);
  const tracker = useHandTracking(onFrame);
  const { start: startCamera, stop: stopCamera } = tracker;

  const batcher = useMemo(() => createOpBatcher((op) => socket.emit('draw:op', op)), []);

  // The camera runs only during your own turn, and comes back on if you used it last time.
  useEffect(() => {
    if (artistTurn && getPref('camera', false)) startCamera();
    if (!artistTurn) stopCamera();
  }, [artistTurn, startCamera, stopCamera]);

  useEffect(() => {
    boardRef.current.reset();
  }, [state.turnId]);

  // Catch up on mount and after every reconnect.
  useEffect(() => {
    let current = true;
    request('draw:sync').then((res) => {
      if (current && res.ok) boardRef.current?.load(res.strokes);
    });
    return () => {
      current = false;
    };
  }, [syncKey, request]);

  useEffect(() => {
    const onOp = (op) => boardRef.current?.apply(op);
    socket.on('draw:op', onOp);
    return () => socket.off('draw:op', onOp);
  }, []);

  const guessed = Boolean(me?.guessed);
  const wasGuessed = useRef(guessed);
  useEffect(() => {
    if (guessed && !wasGuessed.current) smallBurst();
    wasGuessed.current = guessed;
  }, [guessed]);

  const leave = async () => {
    await leaveRoom();
    navigate('/');
  };

  const urgent = drawing && seconds <= 10;

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-3 p-3 lg:h-dvh">
      <header className="sticker flex flex-wrap items-center gap-x-5 gap-y-1 !rounded-2xl px-3 py-1.5 !shadow-[3px_3px_0_var(--line)]">
        <HomeLink />
        <p className="font-bold">Room <span className="select-all">{state.code}</span></p>
        <p className="font-bold">Round {state.round} of {state.settings.rounds}</p>
        <p className="min-w-0 flex-1 truncate font-bold text-muted">
          {artist ? `${isArtist ? 'You are' : `${artist.name} is`} the artist` : ''}
        </p>
        {!online && (
          <p role="status" className="flex items-center gap-1 font-bold"><WifiOff size={16} aria-hidden="true" /> Reconnecting</p>
        )}
        <p
          role="timer"
          aria-label={`${seconds} seconds left`}
          className={`flex items-center gap-1.5 rounded-xl border-3 border-line px-2.5 font-display text-2xl tabular-nums text-on-accent ${urgent ? 'bg-pink' : 'bg-yellow'}`}
        >
          <Timer size={19} aria-hidden="true" /> {seconds}
        </p>
        <span className="max-sm:hidden"><ThemeToggle /></span>
        <button type="button" className="icon-btn" aria-label="Leave room" title="Leave room" onClick={leave}>
          <LogOut size={19} />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[230px_minmax(0,1fr)_300px]">
        <div className="order-3 min-h-0 lg:order-1"><PlayerList state={state} /></div>

        <main className="order-1 flex min-h-0 min-w-0 flex-col items-center gap-2 lg:order-2">
          <WordHint state={state} isArtist={isArtist} />
          <div className="sticker relative aspect-[4/3] w-full max-w-[calc((100dvh-12.5rem)*4/3)] max-lg:max-w-full">
            <DrawingBoard
              ref={boardRef}
              canDraw={canDraw}
              brush={brush}
              onOp={canDraw ? batcher.push : undefined}
              onShapePlaced={() => setBrush({ tool: 'pen' })}
              label={isArtist ? 'Your drawing' : `Drawing by ${artist?.name ?? 'the artist'}`}
            />
            {artistTurn && (
              <div className="absolute right-3 bottom-3 z-30">
                <CameraPanel tracker={tracker} tool={brush.tool} onEnable={(on) => setPref('camera', on)} />
              </div>
            )}
            <TurnOverlay state={state} artist={artist} seconds={seconds} onPick={(index) => send('game:pick', { index })} />
          </div>
          {artistTurn && (
            <Toolbar
              brush={brush}
              setBrush={setBrush}
              disabled={!canDraw}
              onUndo={() => boardRef.current.undo()}
              onClear={() => boardRef.current.clear()}
            />
          )}
        </main>

        <div className="order-2 min-h-0 lg:order-3">
          <Chat
            messages={chat}
            onSend={(text) => send('chat:send', { text })}
            locked={canDraw}
            lockedText="You're drawing"
            placeholder={guessed ? 'Chat with the others who know' : 'Type your guess'}
          />
        </div>
      </div>
    </div>
  );
}
