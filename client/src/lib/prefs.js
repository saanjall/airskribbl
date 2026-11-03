// Browser storage can throw (private mode, blocked site data), so nothing here may fail loudly.

const key = (name) => `airskribbl:${name}`;

function read(store, name, fallback) {
  try {
    const raw = store.getItem(key(name));
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(store, name, value) {
  try {
    if (value === null) store.removeItem(key(name));
    else store.setItem(key(name), JSON.stringify(value));
  } catch {
    // The preference just won't persist.
  }
}

export const getPref = (name, fallback) => read(localStorage, name, fallback);
export const setPref = (name, value) => write(localStorage, name, value);

// Per-tab, so two tabs on one machine can be two different players.
export const getSession = () => read(sessionStorage, 'session', null);
export const setSession = (value) => write(sessionStorage, 'session', value);
