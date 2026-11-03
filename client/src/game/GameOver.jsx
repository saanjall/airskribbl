import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, RotateCcw } from 'lucide-react';
import { Avatar } from '../components/Avatar.jsx';
import { winnerShower } from '../lib/confetti.js';
import { useRoom } from './RoomContext.jsx';

const STEP_HEIGHT = ['h-40', 'h-28', 'h-20'];
const STEP_COLOR = ['bg-yellow', 'bg-lavender', 'bg-mint'];
const PODIUM_ORDER = [1, 0, 2];

export function GameOver() {
  const navigate = useNavigate();
  const { state, send, leaveRoom } = useRoom();
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  const tied = ranked[1] && ranked[1].score === winner.score;
  const isHost = state.hostId === state.you;

  useEffect(() => {
    winnerShower();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 p-4 text-center">
      <h1 className="wordmark text-[clamp(2.4rem,8vw,4.2rem)]" style={{ color: 'var(--yellow)' }}>
        {tied ? 'It\'s a tie!' : `${winner.name} wins!`}
      </h1>

      <ol className="flex w-full max-w-md items-end justify-center gap-3 border-b-3 border-line">
        {PODIUM_ORDER.filter((i) => ranked[i]).map((i) => (
          <motion.li
            key={ranked[i].id}
            className="flex w-1/3 max-w-44 flex-col items-center gap-1"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.5 - i * 0.2 }}
          >
            <Avatar seed={ranked[i].avatar} size={i === 0 ? 84 : 62} />
            <span className="w-full truncate font-bold">{ranked[i].name}</span>
            <div className={`flex w-full flex-col items-center justify-center rounded-t-2xl border-3 border-b-0 border-line text-on-accent ${STEP_HEIGHT[i]} ${STEP_COLOR[i]}`}>
              <span className="font-display text-3xl">{i + 1}</span>
              <span className="font-bold">{ranked[i].score}</span>
            </div>
          </motion.li>
        ))}
      </ol>

      {ranked.length > 3 && (
        <ol start={4} className="w-full max-w-sm">
          {ranked.slice(3).map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 py-1 text-left font-semibold">
              <span className="w-5 text-muted">{i + 4}</span>
              <Avatar seed={p.avatar} size={30} />
              <span className="flex-1 truncate">{p.name}</span>
              <span>{p.score}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {isHost ? (
          <button type="button" className="btn btn-pink btn-big" onClick={() => send('game:lobby')}>
            <RotateCcw size={20} aria-hidden="true" /> Back to lobby
          </button>
        ) : (
          <p role="status" className="self-center font-semibold text-muted">Waiting for the host to start another game.</p>
        )}
        <button
          type="button"
          className="btn btn-plain btn-big"
          onClick={async () => {
            await leaveRoom();
            navigate('/');
          }}
        >
          <LogOut size={20} aria-hidden="true" /> Leave room
        </button>
      </div>
    </main>
  );
}
