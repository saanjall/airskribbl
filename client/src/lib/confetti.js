import confetti from 'canvas-confetti';

const colors = ['#FF4FA3', '#FFD23F', '#3DE8B0', '#2B5BFF', '#B9A7FF'];

export function smallBurst() {
  confetti({ particleCount: 45, spread: 70, origin: { y: 0.65 }, colors, disableForReducedMotion: true });
}

export function winnerShower() {
  const fire = (x, angle) =>
    confetti({ particleCount: 90, angle, spread: 65, origin: { x, y: 0.75 }, colors, disableForReducedMotion: true });
  fire(0.1, 60);
  fire(0.9, 120);
  setTimeout(() => { fire(0.25, 75); fire(0.75, 105); }, 450);
}
