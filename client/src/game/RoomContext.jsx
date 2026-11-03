import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { getSession, setSession } from '../lib/prefs.js';

const REQUEST_TIMEOUT_MS = 6000;
const CHAT_LIMIT = 150;
const TAB_CHECK_MS = 150;

// Connects on demand, so Practice mode never needs the server.
export const socket = io({ autoConnect: false });

function request(event, data) {
  socket.connect();
  return new Promise((resolve) => {
    socket.timeout(REQUEST_TIMEOUT_MS).emit(event, data, (err, res) => {
      resolve(err ? { ok: false, error: 'Can\'t reach the game server. Check that it is running, then try again.' } : res);
    });
  });
}

// Duplicating a tab copies its session, and both tabs would then be one player.
const tabs = new BroadcastChannel('airskribbl:tabs');
tabs.addEventListener('message', ({ data }) => {
  if (data.ask && socket.connected && getSession()?.token === data.ask) tabs.postMessage({ taken: data.ask });
});

function sessionInUse(token) {
  return new Promise((resolve) => {
    const finish = (inUse) => {
      clearTimeout(timer);
      tabs.removeEventListener('message', onReply);
      resolve(inUse);
    };
    const onReply = ({ data }) => {
      if (data.taken === token) finish(true);
    };
    const timer = setTimeout(() => finish(false), TAB_CHECK_MS);
    tabs.addEventListener('message', onReply);
    tabs.postMessage({ ask: token });
  });
}

const RoomContext = createContext(null);
export const useRoom = () => useContext(RoomContext);

export function RoomProvider({ children }) {
  const [state, setState] = useState(null);
  const [chat, setChat] = useState([]);
  const [online, setOnline] = useState(true);
  const [syncKey, setSyncKey] = useState(0);
  const [lostRoom, setLostRoom] = useState(null);

  const forget = useCallback(() => {
    setSession(null);
    setState(null);
    setChat([]);
  }, []);

  useEffect(() => {
    const onConnect = async () => {
      setOnline(true);
      const session = getSession();
      if (!session) return;
      const res = await request('room:join', session);
      if (res.ok) setSyncKey((k) => k + 1);
      else {
        setLostRoom(session.code);
        forget();
      }
    };
    const onDisconnect = () => setOnline(false);
    const onState = (next) => setState(next);
    const onChat = (message) => setChat((list) => [...list.slice(-CHAT_LIMIT), message]);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('chat:msg', onChat);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('chat:msg', onChat);
    };
  }, [forget]);

  const enter = useCallback((res) => {
    if (res.ok) {
      setLostRoom(null);
      setChat([]);
      setSession({ code: res.code, token: res.token });
    }
    return res;
  }, []);

  const value = useMemo(() => ({
    state,
    chat,
    online,
    syncKey,
    lostRoom,
    createRoom: async (data) => enter(await request('room:create', data)),
    joinRoom: async (data) => enter(await request('room:join', data)),
    /** Reconnects a tab that reloaded; the 'connect' handler does the rejoin. */
    resume: async () => {
      if (await sessionInUse(getSession()?.token)) {
        setSession(null);
        setSyncKey((k) => k + 1);
      } else {
        socket.connect();
      }
    },
    leaveRoom: async () => {
      if (socket.connected) await request('room:leave');
      forget();
    },
    request,
    send: (event, data) => socket.emit(event, data),
  }), [state, chat, online, syncKey, lostRoom, enter, forget]);

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
