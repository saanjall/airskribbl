import { AVATAR_COUNT } from '../../../shared/constants.js';

const FILLS = ['#FF4FA3', '#FFD23F', '#3DE8B0', '#6C8CFF', '#B9A7FF', '#FF9D5C'];
const BLOBS = [
  'M50 6c20 0 40 14 42 38s-12 48-42 48S6 72 8 44 30 6 50 6Z',
  'M48 5c14-2 22 8 32 14s14 22 12 36-14 34-36 37S14 80 9 62 6 30 16 20 34 7 48 5Z',
  'M52 7c22 2 37 18 39 37 2 18-9 32-21 40s-30 10-44-2S4 50 11 32 30 5 52 7Z',
];
const INK = '#1E1457';

const FACES = [
  <g key="0"><circle cx="36" cy="44" r="6" /><circle cx="64" cy="44" r="6" /><path d="M36 62c8 9 20 9 28 0" fill="none" strokeWidth="5" strokeLinecap="round" /></g>,
  <g key="1"><path d="M28 44c4-6 12-6 16 0M56 44c4-6 12-6 16 0" fill="none" strokeWidth="5" strokeLinecap="round" /><path d="M38 60c6 12 18 12 24 0Z" /></g>,
  <g key="2"><circle cx="35" cy="44" r="8" fill="#fff" strokeWidth="4" /><circle cx="65" cy="44" r="8" fill="#fff" strokeWidth="4" /><circle cx="37" cy="45" r="3" /><circle cx="67" cy="45" r="3" /><circle cx="50" cy="66" r="5" /></g>,
  <g key="3"><circle cx="36" cy="44" r="6" /><path d="M58 44h14" strokeWidth="5" strokeLinecap="round" /><path d="M38 64c6-5 16 3 24-3" fill="none" strokeWidth="5" strokeLinecap="round" /></g>,
  <g key="4"><path d="M26 38l16 7M74 38l-16 7" strokeWidth="5" strokeLinecap="round" /><circle cx="37" cy="50" r="5" /><circle cx="63" cy="50" r="5" /><path d="M40 68h20" strokeWidth="5" strokeLinecap="round" /></g>,
  <g key="5"><circle cx="36" cy="42" r="6" /><circle cx="64" cy="42" r="6" /><path d="M36 58c9 5 19 5 28 0v4c0 12-28 12-28 0Z" /><path d="M46 70c0 8 10 8 10 0Z" fill="#FF4FA3" strokeWidth="0" /></g>,
  <g key="6"><rect x="24" y="36" width="24" height="14" rx="5" /><rect x="52" y="36" width="24" height="14" rx="5" /><path d="M46 42h8" strokeWidth="4" /><path d="M40 64c6 6 14 6 20 0" fill="none" strokeWidth="5" strokeLinecap="round" /></g>,
  <g key="7"><path d="M28 42l14 6-14 6M72 42l-14 6 14 6" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /><path d="M40 66c3-4 7 4 10 0s7 4 10 0" fill="none" strokeWidth="4" strokeLinecap="round" /></g>,
];

/** Doodle creature generated from a number, so no image assets are needed. */
export function Avatar({ seed = 0, size = 44, className = '' }) {
  const n = ((seed % AVATAR_COUNT) + AVATAR_COUNT) % AVATAR_COUNT;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={BLOBS[n % BLOBS.length]} fill={FILLS[n % FILLS.length]} stroke={INK} strokeWidth="5" />
      <g fill={INK} stroke={INK} strokeWidth="0">{FACES[Math.floor(n / FILLS.length) % FACES.length]}</g>
    </svg>
  );
}
