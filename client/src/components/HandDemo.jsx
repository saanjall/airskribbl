const DUR = '7s';
// Point, draw the fish, then hold. Timing shared by the line and the hand.
const FISH =
  'M92 182C150 92 262 92 324 182L392 118C402 158 402 210 392 248L324 182C262 272 150 272 92 182';
const KEY_TIMES = '0;0.08;0.72;1';

/** Looping hero animation: a pointing hand draws a fish on a white canvas. */
export function HandDemo() {
  return (
    <svg viewBox="0 0 480 360" className="block h-full w-full" role="img" aria-label="A hand pointing in the air and drawing a fish on a canvas">
      <rect width="480" height="360" fill="#fff" />

      <path
        d={FISH}
        pathLength="1"
        fill="none"
        stroke="#FF4FA3"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1 1"
        strokeDashoffset="0"
      >
        <animate attributeName="stroke-dashoffset" dur={DUR} repeatCount="indefinite" values="1;1;0;0" keyTimes={KEY_TIMES} />
      </path>

      <g opacity="1">
        <animate attributeName="opacity" dur={DUR} repeatCount="indefinite" values="0;0;1;1" keyTimes="0;0.74;0.76;1" />
        <circle cx="150" cy="166" r="11" fill="#2B5BFF" />
        <path d="M214 136c14 26 14 62 0 90" fill="none" stroke="#FF4FA3" strokeWidth="8" strokeLinecap="round" />
      </g>

      <g>
        <animateMotion dur={DUR} repeatCount="indefinite" path={FISH} keyPoints="0;0;1;1" keyTimes={KEY_TIMES} calcMode="linear" />
        <circle r="16" fill="#FF4FA3" opacity="0.28">
          <animate attributeName="r" dur="0.9s" repeatCount="indefinite" values="13;20;13" />
        </circle>
        <g stroke="#1E1457" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
          <path
            fill="#FFD23F"
            d="M-10 6C-11-7 9-10 15 3L46 58C64 50 86 56 98 72C114 88 120 110 114 128L176 196L128 238L68 170C44 170 24 150 25 120Z"
          />
          <path fill="none" d="M50 60C60 76 60 94 52 108" />
          <path fill="none" d="M74 58C86 74 86 92 78 106" />
          <path fill="none" d="M98 72C108 86 108 102 102 116" />
        </g>
      </g>
    </svg>
  );
}
