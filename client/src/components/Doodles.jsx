const ITEMS = [
  { className: 'left-[42%] top-[3%] text-pink', tilt: '6deg', delay: '0s', path: 'M6 40C24 8 36 8 44 28S72 48 92 12' },
  { className: 'right-[3%] top-[5%] text-mint', tilt: '-5deg', delay: '-1.5s', path: 'M50 6l12 28 30 3-23 20 7 30-26-16-26 16 7-30L8 37l30-3Z' },
  { className: 'left-[1%] top-[3%] text-lavender', tilt: '-4deg', delay: '-2.2s', path: 'M16 62c-10-24 16-44 32-30 8-20 44-10 36 16 16 10 6 36-14 30-8 18-40 14-44-4-6 2-8-8-10-12Z' },
];

/** Paint splat, star and squiggles around the page edge. Decorative only. */
export function Doodles() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden max-md:hidden">
      {ITEMS.map((item) => (
        <svg
          key={item.path}
          viewBox="0 0 100 100"
          className={`bob absolute h-20 w-20 md:h-28 md:w-28 ${item.className}`}
          style={{ '--tilt': item.tilt, animationDelay: item.delay }}
        >
          <path d={item.path} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}
