import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Copy, Crown, LogOut, Play, WifiOff } from 'lucide-react';
import { DRAW_TIME_OPTIONS, MAX_PLAYERS, MIN_PLAYERS, ROUND_OPTIONS } from '../../../shared/constants.js';
import { Avatar } from '../components/Avatar.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { HomeLink } from '../components/Wordmark.jsx';
import { useRoom } from './RoomContext.jsx';

function Choice({ label, options, value, suffix, disabled, onPick }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1 font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            className={`min-h-11 min-w-11 rounded-xl border-3 border-line px-2.5 font-bold disabled:cursor-default ${option === value ? 'bg-yellow text-on-accent' : 'bg-card disabled:opacity-50'}`}
            onClick={() => onPick(option)}
          >
            {option}{suffix}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Lobby() {
  const navigate = useNavigate();
  const { state, request, send, leaveRoom, online } = useRoom();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const isHost = state.hostId === state.you;
  const present = state.players.filter((p) => p.connected).length;
  const canStart = present >= MIN_PLAYERS;
  const emptySeats = Math.max(0, MAX_PLAYERS - state.players.length);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/room/${state.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(`Copying is blocked here. Share this code instead: ${state.code}`);
    }
  };

  const start = async () => {
    setError(null);
    const res = await request('game:start');
    if (!res.ok) setError(res.error);
  };

  const leave = async () => {
    await leaveRoom();
    navigate('/');
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-5 p-4">
      <header className="flex items-center justify-between gap-3">
        <HomeLink />
        <div className="flex gap-2">
          <ThemeToggle />
          <button type="button" className="btn btn-plain" onClick={leave}>
            <LogOut size={18} aria-hidden="true" /> Leave room
          </button>
        </div>
      </header>

      {!online && (
        <p role="status" className="flex items-center gap-2 font-bold"><WifiOff size={18} aria-hidden="true" /> Reconnecting</p>
      )}

      <main className="grid flex-1 content-start gap-6 md:grid-cols-[1fr_300px]">
        <section aria-label="Players">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-bold text-muted">Room code</p>
              <h1 className="text-[clamp(2.4rem,7vw,3.6rem)] leading-none tracking-wider select-all">{state.code}</h1>
            </div>
            <button type="button" className="btn btn-mint" onClick={copyInvite}>
              {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
              {copied ? 'Link copied' : 'Copy invite link'}
            </button>
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {state.players.map((p, i) => (
              <motion.li
                key={p.id}
                layout
                initial={{ scale: 0.6, rotate: -8 }}
                animate={{ scale: 1, rotate: i % 2 ? 1.5 : -1.5 }}
                transition={{ type: 'spring', stiffness: 320, damping: 15 }}
                className={`sticker relative flex flex-col items-center gap-1 p-3 text-center ${p.connected ? '' : 'opacity-50'}`}
              >
                {p.id === state.hostId && (
                  <span className="absolute -top-3 -right-2 grid h-8 w-8 place-items-center rounded-full border-3 border-line bg-yellow text-on-accent" title="Host">
                    <Crown size={15} aria-label="Host" />
                  </span>
                )}
                <Avatar seed={p.avatar} size={64} />
                <span className="w-full truncate font-bold">{p.name}</span>
                {p.id === state.you && <span className="text-xs text-muted">You</span>}
              </motion.li>
            ))}
            {Array.from({ length: emptySeats }, (_, i) => (
              <li key={i} aria-hidden="true" className="grid min-h-[126px] place-items-center rounded-[22px] border-3 border-dashed border-lavender">
                {i === 0 && (
                  <span className="flex gap-1.5">
                    {[0, 1, 2].map((dot) => (
                      <motion.span
                        key={dot}
                        className="h-2.5 w-2.5 rounded-full bg-lavender"
                        animate={{ y: [0, -7, 0] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.15 }}
                      />
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <aside className="sticker flex h-fit flex-col gap-4 p-5">
          <Choice
            label="Rounds"
            options={ROUND_OPTIONS}
            value={state.settings.rounds}
            disabled={!isHost}
            onPick={(rounds) => send('room:settings', { rounds })}
          />
          <Choice
            label="Seconds to draw"
            options={DRAW_TIME_OPTIONS}
            value={state.settings.drawTime}
            disabled={!isHost}
            onPick={(drawTime) => send('room:settings', { drawTime })}
          />
          {error && <p role="alert" className="font-semibold">{error}</p>}
          {isHost ? (
            <>
              <button type="button" className="btn btn-pink btn-big" disabled={!canStart} onClick={start}>
                <Play size={20} aria-hidden="true" /> Start game
              </button>
              {!canStart && <p className="text-sm text-muted">Share the invite link. You need one more player to start.</p>}
            </>
          ) : (
            <p className="font-semibold text-muted" role="status">Waiting for the host to start the game.</p>
          )}
        </aside>
      </main>
    </div>
  );
}
