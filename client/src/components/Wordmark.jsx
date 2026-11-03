import { Link } from 'react-router-dom';

const LETTERS = [...'AirSkribbl'];
const FILLS = ['var(--yellow)', 'var(--pink)', 'var(--mint)', '#6c8cff', 'var(--lavender)'];
const TILT = [-5, 3, -2, 4, -3, 2, -4, 3, -2, 5];

export function Wordmark({ as: Tag = 'h1', className = '' }) {
  return (
    <Tag className={`wordmark ${className}`} aria-label="AirSkribbl">
      {LETTERS.map((letter, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="inline-block"
          style={{ color: FILLS[i % FILLS.length], transform: `rotate(${TILT[i]}deg)` }}
        >
          {letter}
        </span>
      ))}
    </Tag>
  );
}

export function HomeLink() {
  return (
    <Link to="/" aria-label="AirSkribbl home" className="rounded-lg">
      <Wordmark as="span" className="text-[1.7rem] leading-none" />
    </Link>
  );
}
