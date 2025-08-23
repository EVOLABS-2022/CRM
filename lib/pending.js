// lib/pending.js
const store = new Map();

function put(kind, data, ttlMs = 5 * 60 * 1000) {
  const key = Math.random().toString(36).slice(2, 10);
  const expires = Date.now() + ttlMs;
  store.set(key, { kind, data, expires });
  setTimeout(() => {
    const v = store.get(key);
    if (v && v.expires <= Date.now()) store.delete(key);
  }, ttlMs + 1000);
  return key;
}

function take(key, kind) {
  const v = store.get(key);
  if (!v || v.kind !== kind || v.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  return v.data;
}

function del(key) { store.delete(key); }

module.exports = { put, take, del };