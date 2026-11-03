import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { judgeRound } from './judge.js';
import { Room, TIMINGS } from './Room.js';
import { RateLimiter, cleanName, makeRoomCode } from './util.js';

const clientDist = join(dirname(fileURLToPath(import.meta.url)), '../../client/dist');

export function createApp({ timings = TIMINGS, judge = judgeRound } = {}) {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 64 * 1024,
    cors: process.env.CLIENT_ORIGIN ? { origin: process.env.CLIENT_ORIGIN.split(',') } : undefined,
  });

  const rooms = new Map();

  app.disable('x-powered-by');
  app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!socket\.io).*/, (_req, res) => res.sendFile(join(clientDist, 'index.html')));
  }

  const transportFor = (code) => ({
    toPlayer: (player, event, data) => io.to(player.socketId).emit(event, data),
    toOthers: (player, event, data) => io.sockets.sockets.get(player.socketId)?.to(code).emit(event, data),
  });

  function createRoom() {
    let code;
    do code = makeRoomCode();
    while (rooms.has(code));
    const room = new Room(code, transportFor(code), {
      timings,
      onTurnEnd: judge,
      onEmpty: () => rooms.delete(code),
    });
    rooms.set(code, room);
    return room;
  }

  io.on('connection', (socket) => {
    const joinLimiter = new RateLimiter(5, 0.5);
    let room = null;
    let player = null;

    const enter = (nextRoom, nextPlayer) => {
      room = nextRoom;
      player = nextPlayer;
      socket.join(room.code);
      return { ok: true, code: room.code, token: player.token };
    };

    const leave = () => {
      if (!room) return;
      socket.leave(room.code);
      room.removePlayer(player);
      room = null;
      player = null;
    };

    // Every client event goes through here: a bad payload must never crash the server.
    const on = (event, handler) => {
      socket.on(event, (...args) => {
        const ack = typeof args.at(-1) === 'function' ? args.pop() : () => {};
        try {
          handler(args[0], ack);
        } catch (err) {
          console.error(`[${event}]`, err);
          ack({ ok: false, error: 'Something went wrong on the server' });
        }
      });
    };

    const inRoom = (event, handler) => on(event, (data, ack) => {
      if (room) handler(data, ack);
      else ack({ ok: false, error: 'You are not in a room' });
    });

    on('room:create', (data, ack) => {
      if (!joinLimiter.take()) return ack({ ok: false, error: 'Too many attempts. Wait a few seconds.' });
      const name = cleanName(data?.name);
      if (!name) return ack({ ok: false, error: 'Enter a name first' });
      leave();
      const next = createRoom();
      ack(enter(next, next.addPlayer({ name, avatar: data?.avatar, socketId: socket.id })));
    });

    on('room:join', (data, ack) => {
      if (!joinLimiter.take()) return ack({ ok: false, error: 'Too many attempts. Wait a few seconds.' });
      const code = String(data?.code ?? '').toUpperCase();
      const target = rooms.get(code);
      if (!target) return ack({ ok: false, error: `No room with the code ${code || '(empty)'}`, gone: true });

      const returning = typeof data?.token === 'string' ? target.playerByToken(data.token) : null;
      if (returning) {
        if (room !== target) leave();
        const result = enter(target, returning);
        target.reconnect(returning, socket.id);
        return ack(result);
      }

      const name = cleanName(data?.name);
      if (!name) return ack({ ok: false, error: 'Enter a name first', needsName: true });
      if (target.isFull()) return ack({ ok: false, error: 'This room is full' });
      leave();
      ack(enter(target, target.addPlayer({ name, avatar: data?.avatar, socketId: socket.id })));
    });

    inRoom('room:leave', (_data, ack) => {
      leave();
      ack({ ok: true });
    });

    inRoom('room:settings', (data) => room.updateSettings(player, data));

    inRoom('game:start', (_data, ack) => {
      const error = room.start(player);
      ack(error ? { ok: false, error } : { ok: true });
    });

    inRoom('game:pick', (data) => room.pickWord(player, data?.index));
    inRoom('game:lobby', () => room.backToLobby(player));
    inRoom('chat:send', (data) => room.chat(player, data?.text));
    inRoom('draw:op', (data) => room.drawOp(player, data));
    inRoom('draw:sync', (_data, ack) => ack({ ok: true, strokes: room.strokes }));

    socket.on('disconnect', () => {
      if (room) room.disconnect(player, socket.id);
    });
  });

  return { server, io, rooms };
}
