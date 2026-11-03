import { randomBytes, randomInt } from 'node:crypto';
import { NAME_MAX, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../shared/constants.js';

export function makeRoomCode() {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

export const makeToken = () => randomBytes(16).toString('hex');
export const makeId = () => randomBytes(6).toString('hex');

/** Printable single-line text, or '' if there is nothing left. */
export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export const cleanName = (value) => cleanText(value, NAME_MAX);

/** Lowercase, no accents, punctuation or spacing: "Hot-Dog!" and "hotdog" compare equal. */
export function normalizeGuess(value) {
  return value.normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
}

export function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Token bucket: allows short bursts of `capacity`, refilling at `perSecond`. */
export class RateLimiter {
  constructor(capacity, perSecond, now = Date.now) {
    Object.assign(this, { capacity, perSecond, now, tokens: capacity, last: now() });
  }

  take() {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
