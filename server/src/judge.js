// End-of-round comment. Uses Gemini when GEMINI_API_KEY is set and falls back to
// built-in lines otherwise, so the game never depends on it.

const TIMEOUT_MS = 4000;
const MAX_LENGTH = 160;

const LINES = {
  everyone: [
    'Somehow, everyone guessed correctly. Impressive.',
    'A masterpiece, or everyone is just very lucky.',
    'The air has never looked so legible.',
  ],
  some: [
    'Modern art museums are calling.',
    'Half the room saw it. The other half saw a cry for help.',
    'Bold lines. Bolder confidence.',
  ],
  none: [
    'Nobody got it. The drawing remains a private matter between artist and air.',
    'This one will be understood by future generations.',
    'A brave attempt, and we will say no more about it.',
  ],
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function fallbackLine({ guessed, guessers }) {
  if (guessers > 0 && guessed === guessers) return pick(LINES.everyone);
  return pick(guessed > 0 ? LINES.some : LINES.none);
}

async function askGemini({ word, guessed, guessers, strokes }) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prompt =
    `You are the playful judge of a party game where people draw in mid-air with a finger. ` +
    `The word was "${word}". ${guessed} of ${guessers} players guessed it. The artist used ${strokes} strokes. ` +
    `Write one short, funny, kind comment on the drawing, under 15 words. Plain text only.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Gemini responded ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Gemini returned no text');
  return text.slice(0, MAX_LENGTH);
}

export async function judgeRound(summary) {
  if (process.env.GEMINI_API_KEY) {
    try {
      return await askGemini(summary);
    } catch (err) {
      console.warn(`[judge] ${err.message}; using a built-in line`);
    }
  }
  return fallbackLine(summary);
}
