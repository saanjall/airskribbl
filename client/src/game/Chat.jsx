import { useEffect, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { CHAT_MAX } from '../../../shared/constants.js';

const SYSTEM_STYLE = {
  correct: 'rounded-lg bg-correct-bg px-2 py-1 font-bold text-correct-text',
  close: 'rounded-lg bg-yellow px-2 py-1 font-bold text-on-accent',
  warn: 'rounded-lg bg-pink px-2 py-1 font-bold text-on-accent',
  reveal: 'font-bold',
  join: 'text-sm text-muted',
  leave: 'text-sm text-muted',
  info: 'text-sm text-muted',
};

export function Chat({ messages, onSend, locked, lockedText, placeholder }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    list.scrollTop = list.scrollHeight;
  }, [messages]);

  const submit = (event) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || locked) return;
    onSend(value);
    setText('');
  };

  return (
    <section aria-label="Chat" className="sticker flex min-h-0 flex-col overflow-hidden max-lg:h-60 lg:h-full">
      <ul ref={listRef} aria-live="polite" className="scroll-thin flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3 wrap-anywhere">
        {messages.length === 0 && <li className="text-sm text-muted">Guesses appear here.</li>}
        {messages.map((m) =>
          m.kind === 'chat' ? (
            <li key={m.id} className={m.inner ? 'rounded-lg bg-correct-bg px-2 text-correct-text' : ''}>
              <strong>{m.name}:</strong> {m.text}
            </li>
          ) : (
            <li key={m.id} className={SYSTEM_STYLE[m.kind]}>{m.text}</li>
          ),
        )}
      </ul>
      <form onSubmit={submit} className="flex gap-2 border-t-3 border-line p-2">
        <input
          className="field min-w-0 flex-1"
          aria-label="Type your guess"
          value={text}
          disabled={locked}
          maxLength={CHAT_MAX}
          autoComplete="off"
          placeholder={locked ? lockedText : placeholder}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="icon-btn !h-[46px] !w-[46px] shrink-0 !bg-mint !text-on-accent" disabled={locked} aria-label="Send">
          <SendHorizontal size={20} />
        </button>
      </form>
    </section>
  );
}
