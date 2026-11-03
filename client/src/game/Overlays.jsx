import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { Avatar } from '../components/Avatar.jsx';

const REASON = {
  time: 'Time\'s up',
  'all-guessed': 'Everyone got it',
  'artist-left': 'The artist left',
};

function Panel({ children, label }) {
  // While fading out it must not swallow the artist's first stroke.
  const present = useIsPresent();
  return (
    <motion.div
      role="dialog"
      aria-label={label}
      className={`absolute inset-0 z-20 grid place-items-center rounded-[19px] bg-[#1e1457]/70 p-3 text-center ${present ? '' : 'pointer-events-none'}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="sticker max-h-full w-full max-w-md overflow-auto p-5"
        initial={{ scale: 0.85, rotate: -2 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function TurnOverlay({ state, artist, seconds, onPick }) {
  const choosing = state.phase === 'choosing';
  const reveal = state.phase === 'reveal' ? state.reveal : null;
  const isArtist = state.artistId === state.you;
  const gains = reveal
    ? reveal.gains
      .map((g) => ({ ...g, player: state.players.find((p) => p.id === g.id) }))
      .filter((g) => g.player)
      .sort((a, b) => b.points - a.points)
    : [];

  return (
    <AnimatePresence>
      {choosing && (
        <Panel key="choose" label="Word choice">
          {isArtist ? (
            <>
              <h2 className="text-2xl">Pick a word to draw</h2>
              <div className="mt-4 flex flex-col gap-3">
                {state.choices.map((word, i) => (
                  <button key={word} type="button" className={`btn ${['btn-pink', '', 'btn-mint'][i]}`} onClick={() => onPick(i)}>
                    {word}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm text-muted" aria-live="off">One gets picked for you in {seconds}s</p>
            </>
          ) : (
            <>
              <Avatar seed={artist?.avatar} size={72} className="mx-auto" />
              <h2 className="mt-2 text-2xl">{artist?.name} is picking a word</h2>
            </>
          )}
        </Panel>
      )}
      {reveal && (
        <Panel key="reveal" label="Round results">
          <p className="font-bold text-muted">{REASON[reveal.reason]}. The word was</p>
          <h2 className="mt-1 text-4xl">{reveal.word}</h2>
          {gains.length > 0 ? (
            <ul className="mx-auto mt-3 max-w-xs">
              {gains.map((g) => (
                <li key={g.id} className="flex items-center gap-2 py-0.5 text-left font-semibold">
                  <Avatar seed={g.player.avatar} size={26} />
                  <span className="flex-1 truncate">{g.player.name}</span>
                  <span className="font-bold text-correct-text dark:text-mint">+{g.points}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3">No points this round.</p>
          )}
          {reveal.judge && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 rounded-xl bg-card-soft px-3 py-2 italic"
            >
              {reveal.judge}
            </motion.p>
          )}
        </Panel>
      )}
    </AnimatePresence>
  );
}
