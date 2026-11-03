import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eraser, Hand, LogIn, Pencil, Plus, Pointer, X } from 'lucide-react';
import { Doodles } from '../components/Doodles.jsx';
import { HandDemo } from '../components/HandDemo.jsx';
import { PlayerForm } from '../components/PlayerForm.jsx';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { Wordmark } from '../components/Wordmark.jsx';
import { useRoom } from '../game/RoomContext.jsx';

const GESTURES = [
  { icon: Hand, title: 'Raise your hand', text: 'Hold it up until the camera says Ready.', color: 'bg-mint' },
  { icon: Pointer, title: 'Point to draw', text: 'The line follows your index finger.', color: 'bg-pink' },
  { icon: Eraser, title: 'Wipe to erase', text: 'Pick the eraser and swipe your open hand.', color: 'bg-yellow' },
];

function RoomDialog({ mode, onClose }) {
  const ref = useRef(null);
  const navigate = useNavigate();
  const { createRoom, joinRoom } = useRoom();
  const [error, setError] = useState(null);
  const creating = mode === 'create';

  useEffect(() => {
    ref.current.showModal();
    ref.current.querySelector('input').focus(); // showModal would otherwise focus the close button
  }, []);

  const submit = async ({ name, avatar, code }) => {
    setError(null);
    const res = creating ? await createRoom({ name, avatar }) : await joinRoom({ code, name, avatar });
    if (res.ok) navigate(`/room/${res.code}`);
    else setError(res.error);
  };

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="room-dialog-title">
      <div className="sticker relative p-6">
        <button type="button" className="icon-btn absolute top-3 right-3 !h-10 !w-10" aria-label="Close" onClick={() => ref.current.close()}>
          <X size={18} />
        </button>
        <h2 id="room-dialog-title" className="mb-4 pr-12 text-3xl">{creating ? 'Create a room' : 'Join a room'}</h2>
        <PlayerForm askCode={!creating} submitLabel={creating ? 'Create room' : 'Join room'} onSubmit={submit} error={error} />
      </div>
    </dialog>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(null);

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <Doodles />
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pb-8 lg:grid-cols-[1.05fr_1fr] lg:gap-6">
        <div>
          <Wordmark className="text-[min(18.5vw,7rem)] leading-none whitespace-nowrap lg:text-[min(9.6vw,8rem)]" />
          <p className="mt-5 max-w-[26ch] text-[clamp(1.3rem,2.6vw,1.75rem)] leading-snug font-semibold">
            Your fingers are the paintbrush. The air is your canvas.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <button type="button" className="btn btn-pink btn-big" onClick={() => setDialog('create')}>
              <Plus size={22} aria-hidden="true" /> Create Room
            </button>
            <button type="button" className="btn btn-big" onClick={() => setDialog('join')}>
              <LogIn size={22} aria-hidden="true" /> Join Room
            </button>
            <button type="button" className="btn btn-mint btn-big" onClick={() => navigate('/practice')}>
              <Pencil size={22} aria-hidden="true" /> Practice Drawing
            </button>
          </div>
        </div>

        <motion.div
          initial={{ rotate: -6, scale: 0.9, opacity: 0 }}
          animate={{ rotate: 2, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 160, damping: 13 }}
          className="sticker mx-auto aspect-[4/3] w-full max-w-lg overflow-hidden !rounded-[28px] !shadow-[9px_9px_0_var(--line)]"
        >
          <HandDemo />
        </motion.div>
      </main>

      <section aria-label="How drawing works" className="mx-auto mb-8 grid w-full max-w-6xl gap-4 px-4 sm:grid-cols-3">
        {GESTURES.map(({ icon: Icon, title, text, color }) => (
          <div key={title} className="flex items-center gap-3">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-3 border-line text-on-accent ${color}`}>
              <Icon size={24} aria-hidden="true" />
            </span>
            <p className="leading-snug">
              <strong className="block">{title}</strong>
              <span className="text-sm text-muted">{text}</span>
            </p>
          </div>
        ))}
      </section>

      {dialog && <RoomDialog mode={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
