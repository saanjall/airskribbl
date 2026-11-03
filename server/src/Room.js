import {
  AVATAR_COUNT, BRUSH_COLORS, BRUSH_MAX, BRUSH_MIN, CHAT_MAX, DEFAULT_SETTINGS, DRAW_TIME_OPTIONS,
  ERASER_MAX, MAX_PLAYERS, MIN_PLAYERS, ROUND_OPTIONS, SHAPES,
} from '../../shared/constants.js';
import { RateLimiter, cleanText, editDistance, makeId, makeToken, normalizeGuess } from './util.js';
import { WORDS } from './words.js';

export const TIMINGS = {
  choose: 15_000,
  reveal: 7_000,
  reconnectGrace: 30_000,
  artistGrace: 10_000,
};

const MAX_STROKES = 1500;
const MAX_POINTS = 120_000;
const MAX_POINTS_PER_OP = 400;
const MAX_FILLS = 60;
const CHOICES = 3;

const BASE_POINTS = 100;
const SPEED_POINTS = 400;
const FIRST_GUESS_BONUS = 50;
const ARTIST_POINTS_PER_GUESS = 40;

const unit = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
const shuffle = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * One game room. Holds all authoritative state: players, phase, timers, the secret
 * word and scores. It knows nothing about sockets. `transport` delivers messages:
 * toPlayer(player, event, data) and toOthers(player, event, data).
 */
export class Room {
  constructor(code, transport, { onEmpty = () => {}, onTurnEnd = async () => null, timings = TIMINGS } = {}) {
    Object.assign(this, { code, transport, onEmpty, onTurnEnd, timings });
    this.players = new Map();
    this.hostId = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.phase = 'lobby';
    this.timers = new Set();
    this.artistGraceTimer = null;
    this.resetGame();
  }

  resetGame() {
    this.clearTimers();
    this.round = 0;
    this.turnId = 0;
    this.queue = [];
    this.usedWords = new Set();
    this.clearTurn();
    for (const p of this.players.values()) p.score = 0;
  }

  clearTurn() {
    this.artistId = null;
    this.word = null;
    this.choices = [];
    this.revealed = new Set();
    this.guessedOrder = [];
    this.gains = new Map();
    this.strokes = [];
    this.pointCount = 0;
    this.deadline = null;
    this.reveal = null;
  }

  // Timers

  after(ms, fn) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  clearTimers() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    clearTimeout(this.artistGraceTimer);
    this.artistGraceTimer = null;
  }

  dispose() {
    this.clearTimers();
    for (const p of this.players.values()) clearTimeout(p.graceTimer);
  }

  // Membership

  connected() {
    return [...this.players.values()].filter((p) => p.connected);
  }

  isFull() {
    return this.players.size >= MAX_PLAYERS;
  }

  addPlayer({ name, avatar, socketId }) {
    const player = {
      id: makeId(),
      token: makeToken(),
      name,
      avatar: Number.isInteger(avatar) ? Math.abs(avatar) % AVATAR_COUNT : 0,
      socketId,
      connected: true,
      score: 0,
      graceTimer: null,
      chatLimiter: new RateLimiter(5, 1.5),
      drawLimiter: new RateLimiter(120, 60),
    };
    this.players.set(player.id, player);
    this.hostId ??= player.id;
    this.system(`${name} joined`, 'join');
    this.broadcast();
    return player;
  }

  playerByToken(token) {
    return [...this.players.values()].find((p) => p.token === token);
  }

  reconnect(player, socketId) {
    clearTimeout(player.graceTimer);
    player.graceTimer = null;
    const wasAway = !player.connected;
    player.socketId = socketId;
    player.connected = true;
    if (player.id === this.artistId) {
      clearTimeout(this.artistGraceTimer);
      this.artistGraceTimer = null;
    }
    if (wasAway) this.system(`${player.name} is back`, 'join');
    this.broadcast();
  }

  disconnect(player, socketId) {
    if (player.socketId !== socketId) return; // an older socket closing after a reconnect
    player.connected = false;
    player.graceTimer = setTimeout(() => this.removePlayer(player), this.timings.reconnectGrace);
    this.system(`${player.name} lost connection`, 'leave');
    if (player.id === this.hostId) this.promoteHost();
    if (player.id === this.artistId && (this.phase === 'choosing' || this.phase === 'drawing')) {
      this.artistGraceTimer = setTimeout(() => {
        if (!player.connected) this.endTurn('artist-left');
      }, this.timings.artistGrace);
    }
    if (this.phase === 'drawing') this.checkAllGuessed();
    this.broadcast();
  }

  removePlayer(player) {
    if (!this.players.delete(player.id)) return;
    clearTimeout(player.graceTimer);
    this.queue = this.queue.filter((id) => id !== player.id);
    if (this.players.size === 0) {
      this.dispose();
      this.onEmpty();
      return;
    }
    this.system(`${player.name} left`, 'leave');
    if (player.id === this.hostId) this.promoteHost();

    const inGame = this.phase === 'choosing' || this.phase === 'drawing' || this.phase === 'reveal';
    if (inGame && this.players.size < MIN_PLAYERS) this.finish();
    else if (player.id === this.artistId && (this.phase === 'choosing' || this.phase === 'drawing')) this.endTurn('artist-left');
    else if (this.phase === 'drawing') this.checkAllGuessed();
    this.broadcast();
  }

  promoteHost() {
    const next = this.connected()[0] ?? [...this.players.values()][0];
    this.hostId = next?.id ?? null;
    if (next) this.system(`${next.name} is now the host`, 'info');
  }

  // Host actions

  updateSettings(player, { rounds, drawTime } = {}) {
    if (player.id !== this.hostId || this.phase !== 'lobby') return;
    if (ROUND_OPTIONS.includes(rounds)) this.settings.rounds = rounds;
    if (DRAW_TIME_OPTIONS.includes(drawTime)) this.settings.drawTime = drawTime;
    this.broadcast();
  }

  start(player) {
    if (player.id !== this.hostId) return 'Only the host can start the game';
    if (this.phase !== 'lobby') return 'The game has already started';
    if (this.connected().length < MIN_PLAYERS) return `You need at least ${MIN_PLAYERS} players`;
    this.resetGame();
    this.nextTurn();
    return null;
  }

  backToLobby(player) {
    if (player.id !== this.hostId || this.phase !== 'gameover') return;
    this.phase = 'lobby';
    this.resetGame();
    this.broadcast();
  }

  // Turn flow: choosing -> drawing -> reveal -> next artist, or gameover

  nextTurn() {
    this.clearTimers();
    this.clearTurn();
    if (this.connected().length < MIN_PLAYERS) return this.finish();

    if (this.queue.length === 0) {
      this.round += 1;
      if (this.round > this.settings.rounds) return this.finish();
      this.queue = this.connected().map((p) => p.id);
    }
    const artist = this.players.get(this.queue.shift());
    if (!artist?.connected) return this.nextTurn();

    this.turnId += 1;
    this.artistId = artist.id;
    this.phase = 'choosing';
    this.choices = this.drawChoices();
    this.deadline = Date.now() + this.timings.choose;
    this.after(this.timings.choose, () => this.beginDrawing(this.choices[0]));
    this.broadcast();
  }

  drawChoices() {
    let pool = WORDS.filter((w) => !this.usedWords.has(w));
    if (pool.length < CHOICES) {
      this.usedWords.clear();
      pool = WORDS;
    }
    return shuffle(pool).slice(0, CHOICES);
  }

  pickWord(player, index) {
    if (this.phase !== 'choosing' || player.id !== this.artistId) return;
    const word = this.choices[index];
    if (word) this.beginDrawing(word);
  }

  beginDrawing(word) {
    this.clearTimers();
    this.word = word;
    this.usedWords.add(word);
    this.choices = [];
    this.phase = 'drawing';
    const total = this.settings.drawTime * 1000;
    this.deadline = Date.now() + total;
    this.after(total, () => this.endTurn('time'));

    // Air drawings are rough, so long words give away a letter or two near the end.
    const letters = [...word].filter((c) => c !== ' ').length;
    if (letters >= 4) this.after(total * 0.5, () => this.revealLetter());
    if (letters >= 6) this.after(total * 0.75, () => this.revealLetter());

    const artist = this.players.get(this.artistId);
    if (artist && !artist.connected) {
      clearTimeout(this.artistGraceTimer);
      this.artistGraceTimer = setTimeout(() => {
        if (!artist.connected) this.endTurn('artist-left');
      }, this.timings.artistGrace);
    }
    this.broadcast();
  }

  revealLetter() {
    const hidden = [...this.word].map((c, i) => (c !== ' ' && !this.revealed.has(i) ? i : -1)).filter((i) => i >= 0);
    if (hidden.length <= 1) return;
    this.revealed.add(hidden[Math.floor(Math.random() * hidden.length)]);
    this.broadcast();
  }

  checkAllGuessed() {
    const guessers = this.connected().filter((p) => p.id !== this.artistId);
    if (this.guessedOrder.length > 0 && guessers.every((p) => this.gains.has(p.id))) this.endTurn('all-guessed');
  }

  endTurn(reason) {
    if (this.phase !== 'choosing' && this.phase !== 'drawing') return;
    this.clearTimers();
    const turnId = this.turnId;
    const artist = this.players.get(this.artistId);
    const word = this.word ?? this.choices[0];

    const artistGain = this.guessedOrder.length * ARTIST_POINTS_PER_GUESS;
    if (artist && artistGain) {
      artist.score += artistGain;
      this.gains.set(artist.id, artistGain);
    }

    this.phase = 'reveal';
    this.deadline = Date.now() + this.timings.reveal;
    this.reveal = {
      word,
      reason,
      artistName: artist?.name ?? 'The artist',
      gains: [...this.gains].map(([id, points]) => ({ id, points })),
      judge: null,
    };
    this.system(`The word was "${word}"`, 'reveal');
    this.after(this.timings.reveal, () => this.nextTurn());
    this.broadcast();

    if (reason === 'artist-left') return;
    const guessers = this.connected().filter((p) => p.id !== this.artistId).length;
    Promise.resolve(
      this.onTurnEnd({ word, guessed: this.guessedOrder.length, guessers, strokes: this.strokes.length }),
    )
      .then((line) => {
        if (line && this.phase === 'reveal' && this.turnId === turnId) {
          this.reveal.judge = line;
          this.broadcast();
        }
      })
      .catch((err) => console.warn(`[judge] ${err.message}`));
  }

  finish() {
    this.clearTimers();
    this.clearTurn();
    this.queue = [];
    this.phase = 'gameover';
    this.broadcast();
  }

  // Chat and guessing

  chat(player, raw) {
    const text = cleanText(raw, CHAT_MAX);
    if (!text) return;
    if (!player.chatLimiter.take()) return this.notice(player, 'Slow down a little', 'warn');

    if (this.phase !== 'drawing') return this.say(player, text, this.players.values());

    if (player.id === this.artistId) return this.notice(player, 'Artists can\'t chat while drawing', 'warn');

    const artist = this.players.get(this.artistId);
    if (this.gains.has(player.id)) {
      // Anyone who knows the word only talks to others who know it.
      const insiders = [...this.players.values()].filter((p) => p === artist || this.gains.has(p.id));
      return this.say(player, text, insiders, { inner: true });
    }

    const guess = normalizeGuess(text);
    const answer = normalizeGuess(this.word);
    if (guess === answer) return this.correctGuess(player);

    if (answer.length >= 4 && editDistance(guess, answer) === 1) {
      this.say(player, text, [player, artist].filter(Boolean));
      return this.notice(player, `"${text}" is really close`, 'close');
    }
    this.say(player, text, this.players.values());
  }

  correctGuess(player) {
    const total = this.settings.drawTime * 1000;
    const left = Math.max(0, this.deadline - Date.now()) / total;
    const bonus = this.guessedOrder.length === 0 ? FIRST_GUESS_BONUS : 0;
    const points = Math.round(BASE_POINTS + SPEED_POINTS * left + bonus);
    player.score += points;
    this.gains.set(player.id, points);
    this.guessedOrder.push(player.id);
    this.system(`${player.name} guessed the word! +${points}`, 'correct');
    this.checkAllGuessed();
    this.broadcast();
  }

  say(player, text, recipients, extra = {}) {
    const message = { id: makeId(), kind: 'chat', playerId: player.id, name: player.name, text, ...extra };
    for (const p of recipients) if (p.connected) this.transport.toPlayer(p, 'chat:msg', message);
  }

  system(text, kind) {
    const message = { id: makeId(), kind, text };
    for (const p of this.players.values()) if (p.connected) this.transport.toPlayer(p, 'chat:msg', message);
  }

  notice(player, text, kind) {
    this.transport.toPlayer(player, 'chat:msg', { id: makeId(), kind, text });
  }

  // Drawing relay: only the artist, only while drawing, and only well-formed ops.

  drawOp(player, op) {
    if (this.phase !== 'drawing' || player.id !== this.artistId) return;
    if (!player.drawLimiter.take()) return;
    const clean = this.applyOp(op);
    if (clean) this.transport.toOthers(player, 'draw:op', clean);
  }

  applyOp(op) {
    switch (op?.op) {
      case 'begin': {
        const { id, color, size, tool, x, y } = op.stroke ?? {};
        if (!Number.isInteger(id) || !unit(x) || !unit(y) || this.strokes.length >= MAX_STROKES) return null;
        if (!BRUSH_COLORS.includes(color) || !Number.isFinite(size)) return null;
        const stroke = {
          id, color, x, y,
          size: Math.min(tool === 'eraser' ? ERASER_MAX : BRUSH_MAX, Math.max(BRUSH_MIN, size)),
          tool: tool === 'eraser' ? 'eraser' : 'pen',
        };
        this.strokes.push({ id, color, size: stroke.size, tool: stroke.tool, pts: [x, y] });
        return { op: 'begin', stroke };
      }
      case 'shape': {
        const { id, color, size, shape, pts } = op.stroke ?? {};
        if (!Number.isInteger(id) || !SHAPES.includes(shape) || this.strokes.length >= MAX_STROKES) return null;
        if (!BRUSH_COLORS.includes(color) || !Number.isFinite(size)) return null;
        if (!Array.isArray(pts) || pts.length !== 4 || !pts.every(unit)) return null;
        const stroke = {
          id, color, shape,
          tool: 'pen',
          size: Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, size)),
          pts: [...pts],
        };
        this.strokes.push(stroke);
        return { op: 'shape', stroke };
      }
      case 'fill': {
        const { id, color, pts } = op.stroke ?? {};
        if (!Number.isInteger(id) || !BRUSH_COLORS.includes(color) || this.strokes.length >= MAX_STROKES) return null;
        if (!Array.isArray(pts) || pts.length !== 2 || !pts.every(unit)) return null;
        if (this.strokes.filter((s) => s.tool === 'fill').length >= MAX_FILLS) return null;
        const stroke = { id, color, tool: 'fill', size: BRUSH_MIN, pts: [...pts] };
        this.strokes.push(stroke);
        return { op: 'fill', stroke };
      }
      case 'points': {
        const stroke = this.strokes.find((s) => s.id === op.id);
        const { pts } = op;
        if (!stroke || !Array.isArray(pts) || pts.length % 2 || pts.length > MAX_POINTS_PER_OP) return null;
        if (!pts.every(unit) || this.pointCount + pts.length > MAX_POINTS) return null;
        stroke.pts.push(...pts);
        this.pointCount += pts.length;
        return { op: 'points', id: op.id, pts };
      }
      case 'end':
        return Number.isInteger(op.id) ? { op: 'end', id: op.id } : null;
      case 'undo':
        this.strokes.pop();
        return { op: 'undo' };
      case 'clear':
        this.strokes = [];
        return { op: 'clear' };
      default:
        return null;
    }
  }

  // Views. The word only ever leaves the server through wordFor().

  wordFor(player) {
    if (!this.word) return { word: null, mask: null };
    const knows = player.id === this.artistId || this.gains.has(player.id) || this.phase === 'reveal';
    if (knows) return { word: this.word, mask: this.word };
    const mask = [...this.word].map((c, i) => (c === ' ' || this.revealed.has(i) ? c : '_')).join('');
    return { word: null, mask };
  }

  snapshotFor(player) {
    const { word, mask } = this.wordFor(player);
    return {
      code: this.code,
      you: player.id,
      hostId: this.hostId,
      phase: this.phase,
      round: this.round,
      settings: this.settings,
      turnId: this.turnId,
      artistId: this.artistId,
      remainingMs: this.deadline ? Math.max(0, this.deadline - Date.now()) : null,
      word,
      wordMask: mask,
      choices: player.id === this.artistId ? this.choices : [],
      reveal: this.reveal,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        connected: p.connected,
        guessed: this.gains.has(p.id) && p.id !== this.artistId,
      })),
    };
  }

  broadcast() {
    for (const p of this.players.values()) {
      if (p.connected) this.transport.toPlayer(p, 'room:state', this.snapshotFor(p));
    }
  }
}
