import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { PlayerForm } from '../components/PlayerForm.jsx';
import { HomeLink } from '../components/Wordmark.jsx';
import { GameOver } from '../game/GameOver.jsx';
import { GameScreen } from '../game/GameScreen.jsx';
import { Lobby } from '../game/Lobby.jsx';
import { useRoom } from '../game/RoomContext.jsx';
import { getSession } from '../lib/prefs.js';

function Centered({ children }) {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}

function JoinGate({ code }) {
  const { joinRoom, lostRoom } = useRoom();
  const [error, setError] = useState(lostRoom === code ? 'That room has closed.' : null);
  const [gone, setGone] = useState(lostRoom === code);

  const submit = async ({ name, avatar }) => {
    setError(null);
    const res = await joinRoom({ code, name, avatar });
    if (!res.ok) {
      setError(res.error);
      setGone(Boolean(res.gone));
    }
  };

  return (
    <Centered>
      <div className="mb-4 text-center"><HomeLink /></div>
      <div className="sticker p-6">
        <h1 className="mb-4 text-3xl">Join room {code}</h1>
        {gone ? (
          <>
            <p role="alert" className="font-semibold">{error}</p>
            <Link to="/" className="btn btn-mint mt-4">Back to the home page</Link>
          </>
        ) : (
          <PlayerForm submitLabel="Join room" onSubmit={submit} error={error} />
        )}
      </div>
    </Centered>
  );
}

export function Room() {
  const { code: rawCode } = useParams();
  const code = rawCode.toUpperCase();
  const { state, resume } = useRoom();
  const session = getSession();
  const resuming = session?.code === code && state?.code !== code;

  useEffect(() => {
    if (resuming) resume();
  }, [resuming, resume]);

  if (resuming) {
    return (
      <Centered>
        <p role="status" className="flex items-center justify-center gap-2 text-lg font-bold">
          <LoaderCircle className="animate-spin" aria-hidden="true" /> Getting back into your room
        </p>
      </Centered>
    );
  }
  if (state?.code !== code) return <JoinGate code={code} />;
  if (state.phase === 'lobby') return <Lobby />;
  if (state.phase === 'gameover') return <GameOver />;
  return <GameScreen />;
}
