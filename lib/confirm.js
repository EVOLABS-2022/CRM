// lib/confirm.js
// Lightweight in-memory confirm token store used by commands (edit/delete previews)
// and consumed by the button handler in index.js.

const crypto = require('crypto');

// token -> { userId, scope, action, ...custom, expiresAt }
const TOKENS = new Map();

function put(payload, ttlMs = 5 * 60 * 1000) {
  const token = crypto.randomBytes(9).toString('base64url'); // short and URL-safe
  const expiresAt = Date.now() + ttlMs;
  TOKENS.set(token, { ...payload, expiresAt });
  setTimeout(() => TOKENS.delete(token), ttlMs + 2500).unref?.();
  return token;
}

function consume(token) {
  const entry = TOKENS.get(token);
  if (!entry) return null;
  TOKENS.delete(token);
  if (entry.expiresAt && entry.expiresAt < Date.now()) return null;
  return entry;
}

// Optional (not required right now, but handy)
function peek(token) {
  const entry = TOKENS.get(token);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt < Date.now()) return null;
  return entry;
}

module.exports = { put, consume, peek };