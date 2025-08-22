// lib/board.js
const { EmbedBuilder } = require('discord.js');
const { db } = require('./store');
const { ensureChannelUnder, JOB_BOARD_CH } = require('./bootstrap');
const settings = require('./settings');
const { ensureJobThread } = require('./jobThreads');

function prettyDate(d) {
  if (!d) return null;
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt)) return null;
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()];
  return `${mon} ${dt.getDate()}, ${dt.getFullYear()}`;
}

function jobLine(guildId, j) {
  const due = j.deadline ? ` — *due ${prettyDate(j.deadline)}*` : '';
  const title = j.threadId
    ? `[${j.title}](https://discord.com/channels/${guildId}/${j.threadId})`
    : `**${j.title}**`;
  const desc = j.description ? `\n*${j.description}*` : '';
  const code = `\`${j.code || j.id}\``;
  return `${title} ${code}${due}${desc}`;
}

function buildJobsEmbed(guildId) {
  const jobs = Array.isArray(db.jobs) ? db.jobs : [];
  const active = jobs.filter(j => j.status !== 'completed');

  const lines = active.map(j => jobLine(guildId, j));
  return new EmbedBuilder()
    .setTitle('Jobs')
    .setColor(0x2ecc71)
    .setDescription(lines.length ? lines.join('\n\n') : '_No active jobs_');
}

async function ensureJobBoardMessage(client, guildId) {
  const channel = await ensureChannelUnder(client, guildId, JOB_BOARD_CH);
  if (!channel) return null;

  // ensure each job has thread before we link it (best-effort)
  const clients = Array.isArray(db.clients) ? db.clients : [];
  for (const j of (Array.isArray(db.jobs) ? db.jobs : [])) {
    if (j.status === 'completed') continue;
    if (!j.threadId) {
      const c = clients.find(x => x.id === j.clientId);
      if (c?.channelId) {
        try {
          const ch = await client.channels.fetch(c.channelId).catch(() => null);
          if (ch) await ensureJobThread(client, c, ch, j);
        } catch {}
      }
    }
  }

  const msgId = settings.getJobBoardMessageId(guildId);
  if (msgId) {
    try {
      const msg = await channel.messages.fetch(msgId);
      return msg;
    } catch { /* fallthrough */ }
  }
  const sent = await channel.send({ embeds: [buildJobsEmbed(guildId)] });
  settings.setJobBoardMessageId(guildId, sent.id);
  return sent;
}

async function refreshBoard(client, guildId) {
  const msg = await ensureJobBoardMessage(client, guildId);
  if (!msg) return;
  await msg.edit({ embeds: [buildJobsEmbed(guildId)] });
  console.log(`🔄 Board refreshed for guild ${guildId}`);
}

async function refreshAllBoards(client) {
  for (const [guildId] of client.guilds.cache) {
    await refreshBoard(client, guildId).catch(e =>
      console.warn(`⚠️ Failed to refresh board for ${guildId}`, e?.message || e)
    );
  }
}

module.exports = {
  refreshBoard,
  refreshAllBoards,
  ensureJobBoardMessage,
};