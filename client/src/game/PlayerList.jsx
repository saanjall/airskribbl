import { AnimatePresence, motion } from 'framer-motion';
import { Check, Crown, Pencil, WifiOff } from 'lucide-react';
import { Avatar } from '../components/Avatar.jsx';

export function PlayerList({ state }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  return (
    <section aria-label="Players and scores" className="sticker scroll-thin overflow-auto p-2 max-lg:overflow-y-hidden lg:h-full">
      <ol className="flex gap-1 lg:flex-col">
        <AnimatePresence initial={false}>
          {ranked.map((p, i) => {
            const artist = p.id === state.artistId;
            return (
              <motion.li
                key={p.id}
                layout
                exit={{ opacity: 0, scale: 0.8 }}
                className={`flex shrink-0 items-center gap-2 rounded-xl p-1.5 lg:shrink ${p.guessed ? 'bg-correct-bg text-correct-text' : ''} ${artist ? 'bg-yellow text-on-accent' : ''} ${p.connected ? '' : 'opacity-50'}`}
              >
                <span className="w-4 text-center text-sm font-bold">{i + 1}</span>
                <Avatar seed={p.avatar} size={36} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="flex items-center gap-1 font-bold">
                    <span className="max-w-28 truncate">{p.name}</span>
                    {p.id === state.hostId && <Crown size={13} className="shrink-0" aria-label="Host" />}
                  </span>
                  <span className="text-sm">{p.score} pts{p.id === state.you ? ', you' : ''}</span>
                </span>
                {artist && <Pencil size={17} className="shrink-0" aria-label="Drawing now" />}
                {p.guessed && <Check size={18} strokeWidth={3} className="shrink-0" aria-label="Guessed the word" />}
                {!p.connected && <WifiOff size={16} className="shrink-0" aria-label="Disconnected" />}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </section>
  );
}
