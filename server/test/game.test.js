import test from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { editDistance, normalizeGuess } from '../src/util.js';

const timings = { choose: 300, reveal: 120, reconnectGrace: 250, artistGrace: 120 };

async function harness(t, overrides = {}) {
  const { server, io, rooms } = createApp({ timings: { ...timings, ...overrides }, judge: async () => 'nice' });
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const clients = [];

  const client = async () => {
    const socket = connect(url, { transports: ['websocket'], reconnection: false, forceNew: true });
    const c = { socket, state: null, chat: [], ops: [] };
    socket.on('room:state', (s) => { c.state = s; });
    socket.on('chat:msg', (m) => c.chat.push(m));
    socket.on('draw:op', (o) => c.ops.push(o));
    c.ask = (event, data) => new Promise((r) => socket.emit(event, data, r));
    clients.push(c);
    await new Promise((r) => socket.on('connect', r));
    return c;
  };

  t.after(async () => {
    clients.forEach((c) => c.socket.disconnect());
    for (const room of rooms.values()) room.dispose();
    await io.close();
  });
  return { client, rooms };
}

const until = async (check, label = 'condition') => {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail(`timed out waiting for ${label}`);
};

async function startedGame(h, count = 3) {
  const host = await h.client();
  const { code, token } = await host.ask('room:create', { name: 'Host', avatar: 1 });
  host.token = token;
  const players = [host];
  for (let i = 1; i < count; i++) {
    const c = await h.client();
    c.token = (await c.ask('room:join', { code, name: `P${i}` })).token;
    players.push(c);
  }
  await until(() => players.every((p) => p.state?.players.length === count), 'everyone in lobby');
  assert.deepEqual(await host.ask('game:start'), { ok: true });
  await until(() => players.every((p) => p.state.phase === 'choosing'), 'choosing');
  const artist = players.find((p) => p.state.artistId === p.state.you);
  const guessers = players.filter((p) => p !== artist);
  return { code, players, host, artist, guessers };
}

async function toDrawing(game) {
  game.artist.socket.emit('game:pick', { index: 0 });
  await until(() => game.players.every((p) => p.state.phase === 'drawing'), 'drawing');
  return game.artist.state.word;
}

test('guess normalisation and edit distance', () => {
  assert.equal(normalizeGuess(' Hot-Dog! '), 'hotdog');
  assert.equal(normalizeGuess('Café'), 'cafe');
  assert.equal(editDistance('rocket', 'rockt'), 1);
  assert.equal(editDistance('cat', 'cat'), 0);
});

test('rooms: join rules, codes and host-only start', async (t) => {
  const h = await harness(t);
  const a = await h.client();
  assert.equal((await a.ask('room:create', { name: '   ' })).ok, false);
  const { code } = await a.ask('room:create', { name: 'Ana' });
  assert.match(code, /^[A-Z2-9]{6}$/);

  assert.equal((await a.ask('game:start')).ok, false, 'needs two players');
  const b = await h.client();
  assert.equal((await b.ask('room:join', { code: 'NOPE22', name: 'Bo' })).ok, false);
  assert.equal((await b.ask('room:join', { code: code.toLowerCase(), name: 'Bo' })).ok, true);
  assert.equal((await b.ask('game:start')).ok, false, 'only the host starts');

  const extras = [];
  for (let i = 0; i < 6; i++) {
    const c = await h.client();
    extras.push(await c.ask('room:join', { code, name: `X${i}` }));
  }
  assert.ok(extras.every((r) => r.ok));
  const late = await h.client();
  assert.match((await late.ask('room:join', { code, name: 'Late' })).error, /full/);
});

test('the secret word only reaches the artist', async (t) => {
  const h = await harness(t);
  const game = await startedGame(h);
  assert.equal(game.artist.state.choices.length, 3);
  game.guessers.forEach((g) => assert.deepEqual(g.state.choices, []));

  const word = await toDrawing(game);
  assert.ok(word);
  for (const g of game.guessers) {
    assert.equal(g.state.word, null);
    assert.equal(g.state.wordMask.length, word.length);
    assert.ok(!JSON.stringify(g.state).includes(`"${word}"`));
    assert.match(g.state.wordMask, /^[_ -]+$/);
  }
});

test('scoring is server side, faster guesses earn more, no double scoring', async (t) => {
  const h = await harness(t);
  const game = await startedGame(h);
  const word = await toDrawing(game);
  const [first, second] = game.guessers;

  first.socket.emit('chat:send', { text: 'definitely not it' });
  await until(() => second.chat.some((m) => m.text === 'definitely not it'), 'wrong guess relayed');

  first.socket.emit('chat:send', { text: word.toUpperCase() });
  await until(() => first.state.players.find((p) => p.id === first.state.you).guessed, 'first guess');
  assert.equal(first.state.word, word, 'a correct guesser may now see the word');
  assert.ok(!second.chat.some((m) => m.text?.toLowerCase() === word), 'the answer is never relayed');
  const score = () => first.state.players.find((p) => p.id === first.state.you).score;
  const firstScore = score();
  assert.ok(firstScore > 400);

  first.socket.emit('chat:send', { text: word });
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(score(), firstScore, 'no duplicate scoring');
  assert.ok(!second.chat.some((m) => m.text === word), 'insiders do not leak to guessers');

  await new Promise((r) => setTimeout(r, 1100));
  second.socket.emit('chat:send', { text: word });
  await until(() => second.state.phase === 'reveal', 'all guessed ends the turn');
  const secondScore = second.state.players.find((p) => p.id === second.state.you).score;
  assert.ok(secondScore < firstScore);
  assert.equal(second.state.reveal.reason, 'all-guessed');
  assert.equal(second.state.reveal.word, word);
  const artistScore = second.state.players.find((p) => p.id === game.artist.state.you).score;
  assert.equal(artistScore, 80);
  await until(() => second.state.reveal?.judge === 'nice' || second.state.phase === 'choosing', 'judge line');
});

test('the artist cannot guess or chat while drawing', async (t) => {
  const h = await harness(t);
  const game = await startedGame(h);
  const word = await toDrawing(game);
  game.artist.socket.emit('chat:send', { text: word });
  await until(() => game.artist.chat.some((m) => m.kind === 'warn'), 'artist warned');
  assert.ok(game.artist.state.players.every((p) => p.score === 0));
  assert.ok(!game.guessers[0].chat.some((m) => m.text === word));
});

test('near misses stay private and chat is rate limited', async (t) => {
  const h = await harness(t);
  const game = await startedGame(h);
  const word = await toDrawing(game);
  const [a, b] = game.guessers;
  const typo = `${word}x`;
  a.socket.emit('chat:send', { text: typo });
  await until(() => a.chat.some((m) => m.kind === 'close') || word.replace(/\W/g, '').length < 4, 'close notice');
  assert.ok(!b.chat.some((m) => m.text === typo));
  for (let i = 0; i < 12; i++) b.socket.emit('chat:send', { text: `spam ${i}` });
  await until(() => b.chat.some((m) => m.kind === 'warn'), 'rate limit notice');
  assert.ok(b.chat.filter((m) => m.text?.startsWith('spam')).length <= 7);
});

test('drawing: artist only, validated, and replayable', async (t) => {
  const h = await harness(t);
  const game = await startedGame(h);
  const [viewer, other] = game.guessers;
  const stroke = { id: 1, color: '#E5484D', size: 12, tool: 'pen', x: 0.5, y: 0.5 };

  viewer.socket.emit('draw:op', { op: 'begin', stroke });
  game.artist.socket.emit('draw:op', { op: 'begin', stroke });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(other.ops.length, 0, 'nothing is relayed before drawing starts');

  await toDrawing(game);
  viewer.socket.emit('draw:op', { op: 'begin', stroke });
  game.artist.socket.emit('draw:op', { op: 'begin', stroke: { ...stroke, color: 'url(evil)' } });
  game.artist.socket.emit('draw:op', { op: 'begin', stroke: { ...stroke, x: 9 } });
  game.artist.socket.emit('draw:op', { op: 'begin', stroke: { ...stroke, size: 9999 } });
  game.artist.socket.emit('draw:op', { op: 'points', id: 1, pts: [0.6, 0.6, 0.7] });
  game.artist.socket.emit('draw:op', { op: 'points', id: 1, pts: [0.6, 0.6, 0.7, 0.7] });
  game.artist.socket.emit('draw:op', { op: 'end', id: 1 });
  await until(() => other.ops.length === 3, 'three valid ops');
  assert.equal(other.ops[0].stroke.size, 48);
  assert.equal(game.artist.ops.length, 0, 'the artist does not get an echo');

  const { strokes } = await viewer.ask('draw:sync');
  assert.equal(strokes.length, 1);
  assert.deepEqual(strokes[0].pts, [0.5, 0.5, 0.6, 0.6, 0.7, 0.7]);

  game.artist.socket.emit('draw:op', { op: 'undo' });
  await until(() => other.ops.at(-1).op === 'undo', 'undo relayed');
  assert.equal((await viewer.ask('draw:sync')).strokes.length, 0);
});

test('shapes: validated, relayed and replayable', async (t) => {
  const h = await harness(t);
  const game = await startedGame(h);
  await toDrawing(game);
  const [viewer] = game.guessers;
  const shape = { id: 1, color: '#E5484D', size: 12, shape: 'rect', pts: [0.1, 0.1, 0.5, 0.5] };

  viewer.socket.emit('draw:op', { op: 'shape', stroke: shape });
  game.artist.socket.emit('draw:op', { op: 'shape', stroke: { ...shape, shape: 'hexagon' } });
  game.artist.socket.emit('draw:op', { op: 'shape', stroke: { ...shape, color: 'url(evil)' } });
  game.artist.socket.emit('draw:op', { op: 'shape', stroke: { ...shape, pts: [0.1, 0.1, 9, 0.5] } });
  game.artist.socket.emit('draw:op', { op: 'shape', stroke: { ...shape, pts: [0.1, 0.1] } });
  game.artist.socket.emit('draw:op', { op: 'shape', stroke: { ...shape, size: 9999 } });
  await until(() => viewer.ops.length === 1, 'one valid shape');
  assert.equal(viewer.ops[0].stroke.size, 48);

  const { strokes } = await viewer.ask('draw:sync');
  assert.equal(strokes.length, 1);
  assert.equal(strokes[0].shape, 'rect');
  game.artist.socket.emit('draw:op', { op: 'undo' });
  await until(() => viewer.ops.at(-1).op === 'undo', 'undo relayed');
  assert.equal((await viewer.ask('draw:sync')).strokes.length, 0);
});

test('fills: validated, relayed, replayable and capped', async (t) => {
  const h = await harness(t);
  const game = await startedGame(h);
  await toDrawing(game);
  const [viewer] = game.guessers;
  const fill = { id: 1, color: '#E5484D', pts: [0.5, 0.5] };

  viewer.socket.emit('draw:op', { op: 'fill', stroke: fill });
  game.artist.socket.emit('draw:op', { op: 'fill', stroke: { ...fill, color: 'url(evil)' } });
  game.artist.socket.emit('draw:op', { op: 'fill', stroke: { ...fill, pts: [0.5, 7] } });
  game.artist.socket.emit('draw:op', { op: 'fill', stroke: { ...fill, pts: [0.5] } });
  game.artist.socket.emit('draw:op', { op: 'fill', stroke: fill });
  await until(() => viewer.ops.length === 1, 'one valid fill');
  assert.equal(viewer.ops[0].stroke.tool, 'fill');
  assert.equal((await viewer.ask('draw:sync')).strokes[0].tool, 'fill');

  for (let id = 2; id <= 70; id++) game.artist.socket.emit('draw:op', { op: 'fill', stroke: { ...fill, id } });
  await until(() => viewer.ops.length >= 60, 'fills up to the cap');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(viewer.ops.length, 60);
});

test('rotation: every player draws, then the game ends with scores', async (t) => {
  const h = await harness(t);
  const game = await startedGame(h, 2);
  game.host.socket.emit('room:settings', { rounds: 99 });
  const artists = [];
  const rooms = [...h.rooms.values()];
  rooms[0].settings.rounds = 2;
  for (let turn = 0; turn < 4; turn++) {
    await until(() => game.host.state.phase === 'choosing', `turn ${turn}`);
    const artistId = game.host.state.artistId;
    artists.push(artistId);
    const artist = game.players.find((p) => p.state.you === artistId);
    const guesser = game.players.find((p) => p !== artist);
    artist.socket.emit('game:pick', { index: 1 });
    await until(() => artist.state.phase === 'drawing' && artist.state.word, 'word chosen');
    guesser.socket.emit('chat:send', { text: artist.state.word });
    await until(() => game.host.state.phase === 'reveal', 'reveal');
    await until(() => game.host.state.phase !== 'reveal', 'next turn');
  }
  assert.equal(game.host.state.phase, 'gameover');
  assert.equal(new Set(artists).size, 2);
  assert.equal(artists[0] === artists[1], false);
  assert.ok(game.host.state.players.every((p) => p.score > 0));

  game.host.socket.emit('game:lobby');
  await until(() => game.host.state.phase === 'lobby', 'back in lobby');
  assert.ok(game.host.state.players.every((p) => p.score === 0));
});

test('an unpicked word is chosen automatically when the timer runs out', async (t) => {
  const h = await harness(t, { choose: 60 });
  const game = await startedGame(h);
  await until(() => game.artist.state.phase === 'drawing', 'auto pick');
  assert.ok(game.artist.state.word);
});

test('a reconnecting player keeps score and the artist turn', async (t) => {
  const h = await harness(t);
  const game = await startedGame(h);
  await toDrawing(game);
  const { artist, code } = game;
  const id = artist.state.you;
  artist.socket.disconnect();
  await until(() => game.guessers[0].state.players.find((p) => p.id === id).connected === false, 'seen offline');

  const back = await h.client();
  const result = await back.ask('room:join', { code, token: artist.token });
  assert.equal(result.ok, true);
  await until(() => back.state?.you === id, 'same identity');
  assert.ok(back.state.word, 'the artist still knows the word');
  await new Promise((r) => setTimeout(r, timings.artistGrace + 60));
  assert.equal(back.state.phase, 'drawing', 'the grace timer was cancelled');
});

test('an artist who vanishes ends the turn and play continues', async (t) => {
  const h = await harness(t);
  const game = await startedGame(h);
  await toDrawing(game);
  const watcher = game.guessers[0];
  game.artist.socket.disconnect();
  await until(() => watcher.state.phase === 'reveal', 'turn ended');
  assert.equal(watcher.state.reveal.reason, 'artist-left');
  await until(() => watcher.state.phase === 'choosing', 'next artist');
  assert.notEqual(watcher.state.artistId, game.artist.state.you);
});

test('host leaving promotes someone, and empty rooms are removed', async (t) => {
  const h = await harness(t);
  const a = await h.client();
  const { code } = await a.ask('room:create', { name: 'Ana' });
  const b = await h.client();
  await b.ask('room:join', { code, name: 'Bo' });
  await until(() => b.state?.players.length === 2, 'two players');
  await a.ask('room:leave');
  await until(() => b.state.hostId === b.state.you, 'new host');
  b.socket.disconnect();
  await until(() => h.rooms.size === 0, 'room removed after grace');
});

test('dropping below two players ends a running game', async (t) => {
  const h = await harness(t);
  const game = await startedGame(h, 2);
  await toDrawing(game);
  await game.guessers[0].ask('room:leave');
  await until(() => game.artist.state.phase === 'gameover', 'gameover');
});

test('malformed events do not hurt the server', async (t) => {
  const h = await harness(t);
  const a = await h.client();
  for (const bad of [null, 42, 'x', [], { name: { a: 1 } }, { name: 'x'.repeat(5000) }]) {
    a.socket.emit('room:create', bad, () => {});
    a.socket.emit('chat:send', bad);
    a.socket.emit('draw:op', bad);
    a.socket.emit('room:join', bad, () => {});
  }
  await new Promise((r) => setTimeout(r, 2100));
  const { ok } = await a.ask('room:create', { name: 'Still fine' });
  assert.equal(ok, true);
});
