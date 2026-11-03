import { useState } from 'react';
import { Dices, LoaderCircle } from 'lucide-react';
import { AVATAR_COUNT, NAME_MAX, ROOM_CODE_LENGTH } from '../../../shared/constants.js';
import { getPref, setPref } from '../lib/prefs.js';
import { Avatar } from './Avatar.jsx';

/** Name and avatar picker, plus a room code field when `askCode` is set. */
export function PlayerForm({ askCode = false, submitLabel, onSubmit, error, initialCode = '' }) {
  const [name, setName] = useState(() => getPref('name', ''));
  const [avatar, setAvatar] = useState(() => getPref('avatar', Math.floor(Math.random() * AVATAR_COUNT)));
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setPref('name', name.trim());
    setPref('avatar', avatar);
    setBusy(true);
    await onSubmit({ name: name.trim(), avatar, code: code.trim().toUpperCase() });
    setBusy(false);
  };

  const ready = name.trim() && (!askCode || code.trim().length === ROOM_CODE_LENGTH);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="relative">
          <Avatar seed={avatar} size={72} />
          <button
            type="button"
            className="absolute -right-2 -bottom-1 grid h-8 w-8 place-items-center rounded-full border-3 border-line bg-yellow text-on-accent"
            aria-label="Pick a different avatar"
            title="Pick a different avatar"
            onClick={() => setAvatar((a) => (a + 1 + Math.floor(Math.random() * (AVATAR_COUNT - 1))) % AVATAR_COUNT)}
          >
            <Dices size={16} />
          </button>
        </div>
        <label className="flex-1 font-bold">
          Your name
          <input
            className="field mt-1"
            value={name}
            maxLength={NAME_MAX}
            autoComplete="nickname"
            autoFocus
            placeholder="Picasso's cousin"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      {askCode && (
        <label className="font-bold">
          Room code
          <input
            className="field mt-1 font-display text-xl tracking-[0.2em] uppercase"
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            autoComplete="off"
            spellCheck={false}
            placeholder="ABC234"
            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
          />
        </label>
      )}

      {error && <p role="alert" className="font-semibold text-[#c21767] dark:text-pink">{error}</p>}

      <button type="submit" className="btn btn-pink btn-big" disabled={!ready || busy}>
        {busy && <LoaderCircle className="animate-spin" size={20} aria-hidden="true" />}
        {submitLabel}
      </button>
    </form>
  );
}
