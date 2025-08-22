// lib/settings.js
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../data/settings.json');

let data = { guilds: {} };
try {
  if (fs.existsSync(FILE)) data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  data = { guilds: {} };
}

function save() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); } catch {}
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function ensureGuild(guildId) {
  if (!data.guilds[guildId]) data.guilds[guildId] = {};
  return data.guilds[guildId];
}

// Internal persistence (message IDs) — not user-facing “config”
function getClientPanelMessageId(guildId) {
  return ensureGuild(guildId).clientPanelMessageId || null;
}
function setClientPanelMessageId(guildId, messageId) {
  ensureGuild(guildId).clientPanelMessageId = messageId; save();
}

function getJobBoardMessageId(guildId) {
  return ensureGuild(guildId).jobBoardMessageId || null;
}
function setJobBoardMessageId(guildId, messageId) {
  ensureGuild(guildId).jobBoardMessageId = messageId; save();
}

module.exports = {
  save,
  ensureGuild,
  getClientPanelMessageId,
  setClientPanelMessageId,
  getJobBoardMessageId,
  setJobBoardMessageId,
};